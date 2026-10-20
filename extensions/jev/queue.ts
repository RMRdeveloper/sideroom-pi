const MAX_QUEUED_REVIEWS = 16;

interface ReviewJob {
  readonly key: string;
  readonly dependencies?: readonly string[];
  readonly signal?: AbortSignal;
  readonly run: (signal: AbortSignal) => Promise<void>;
}

interface QueuedReview extends ReviewJob {
  readonly controller: AbortController;
  readonly signal: AbortSignal;
}

export class JevReviewQueue {
  private readonly queued = new Map<string, QueuedReview>();
  private active: QueuedReview | undefined;
  private running: Promise<void> | undefined;
  private failures: unknown[] = [];
  private readonly waiting = new Set<QueuedReview>();

  enqueue(job: ReviewJob): Promise<void> | undefined {
    this.invalidate(job.key);
    const controller = new AbortController();
    const signal = job.signal === undefined
      ? controller.signal
      : AbortSignal.any([controller.signal, job.signal]);
    const review = { ...job, controller, signal };
    if (this.queued.size >= MAX_QUEUED_REVIEWS) {
      this.waiting.add(review);
      return this.enqueueWhenReady(review);
    }
    this.queued.set(job.key, review);
    this.pump();
    return undefined;
  }

  private async enqueueWhenReady(job: QueuedReview): Promise<void> {
    try {
      while (this.queued.size >= MAX_QUEUED_REVIEWS && this.running !== undefined && !job.signal.aborted) {
        await this.running;
      }
      if (!job.signal.aborted) {
        this.queued.set(job.key, job);
        this.pump();
      }
    } finally {
      this.waiting.delete(job);
    }
  }

  invalidate(path: string): void {
    for (const [key, job] of this.queued) {
      if (key === path || job.dependencies?.includes(path)) {
        job.controller.abort();
        this.queued.delete(key);
      }
    }
    for (const job of this.waiting) {
      if (job.key === path || job.dependencies?.includes(path)) {
        job.controller.abort();
      }
    }
    if (this.active?.key === path || this.active?.dependencies?.includes(path)) {
      this.active.controller.abort();
    }
  }

  cancel(): void {
    this.active?.controller.abort();
    for (const job of this.queued.values()) {
      job.controller.abort();
    }
    this.queued.clear();
    for (const job of this.waiting) {
      job.controller.abort();
    }
    this.waiting.clear();
    this.failures = [];
  }

  async drain(): Promise<void> {
    while (this.running !== undefined || this.waiting.size > 0) {
      await this.running;
    }
    if (this.failures.length > 0) {
      const failures = this.failures;
      this.failures = [];
      throw new AggregateError(failures, 'Jev background review failed');
    }
  }

  private pump(): void {
    if (this.running !== undefined) {
      return;
    }
    const next = this.queued.entries().next().value;
    if (next === undefined) {
      return;
    }
    const [key, job] = next;
    this.queued.delete(key);
    if (job.signal.aborted) {
      this.pump();
      return;
    }
    this.active = job;
    this.running = Promise.resolve()
      .then(() => {
        if (!job.signal.aborted) {
          return job.run(job.signal);
        }
      })
      .catch((error: unknown) => {
        if (!job.signal.aborted) {
          this.failures.push(error);
        }
      })
      .finally(() => {
        this.active = undefined;
        this.running = undefined;
        this.pump();
      });
  }
}
