globalThis.createDestinations = function createDestinations() {
  let sessions = [];
  let selected;
  let preferredId;
  let automaticSelection = false;

  return {
    update(available) {
      sessions = [...available];
      selected = sessions.find(
        (session) => session.id === (preferredId ?? selected?.id),
      );
      if (automaticSelection && sessions.length > 1) {
        selected = undefined;
        automaticSelection = false;
      }
      if (!selected && !preferredId && sessions.length === 1) {
        selected = sessions[0];
        automaticSelection = true;
      }
    },
    choose(id) {
      const destination = sessions.find((session) => session.id === id);
      if (!destination) {
        throw new Error('That Pi session is no longer available.');
      }
      selected = destination;
      preferredId = destination.id;
      automaticSelection = false;
    },
    clear() {
      sessions = [];
      selected = undefined;
      preferredId = undefined;
      automaticSelection = false;
    },
    current: () => selected,
    all: () => [...sessions],
  };
};
