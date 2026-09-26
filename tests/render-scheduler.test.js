const test = require("node:test");
const assert = require("node:assert/strict");

const { createRenderScheduler } = require("../render-scheduler.js");

function fakeFrameDriver() {
  let nextId = 1;
  const queue = new Map();

  return {
    requestFrame: (callback) => {
      const id = nextId++;
      queue.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      queue.delete(id);
    },
    triggerNextFrame: () => {
      if (queue.size === 0) return false;
      const [id, callback] = Array.from(queue.entries())[0];
      queue.delete(id);
      callback();
      return true;
    },
    pendingCount: () => queue.size,
  };
}

test("single update schedules a render on the next frame", () => {
  let renderCount = 0;
  const driver = fakeFrameDriver();
  const scheduler = createRenderScheduler({
    render: () => {
      renderCount++;
    },
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
  });

  assert.equal(scheduler.isScheduled(), false);
  scheduler.update();

  assert.equal(scheduler.isScheduled(), true);
  assert.equal(renderCount, 0);
  assert.equal(driver.pendingCount(), 1);

  driver.triggerNextFrame();

  assert.equal(renderCount, 1);
  assert.equal(scheduler.isScheduled(), false);
  assert.equal(driver.pendingCount(), 0);
});

test("multiple updates in the same frame coalesce into a single render", () => {
  let renderCount = 0;
  const driver = fakeFrameDriver();
  const scheduler = createRenderScheduler({
    render: () => {
      renderCount++;
    },
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
  });

  // Multiple updates called in succession
  scheduler.update();
  scheduler.update();
  scheduler.update();

  assert.equal(driver.pendingCount(), 1);
  assert.equal(renderCount, 0);

  driver.triggerNextFrame();

  assert.equal(renderCount, 1);
  assert.equal(driver.pendingCount(), 0);
});

test("mutators passed to update run immediately, while rendering is deferred", () => {
  const state = { count: 0, tag: "init" };
  const renders = [];
  const driver = fakeFrameDriver();
  const scheduler = createRenderScheduler({
    render: () => {
      renders.push({ ...state });
    },
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
  });

  scheduler.update(() => {
    state.count = 1;
    state.tag = "first";
  });

  assert.equal(state.count, 1);
  assert.equal(state.tag, "first");
  assert.equal(renders.length, 0);

  scheduler.update(() => {
    state.count = 2;
    state.tag = "second";
  });

  assert.equal(state.count, 2);
  assert.equal(state.tag, "second");
  assert.equal(renders.length, 0);

  driver.triggerNextFrame();

  assert.equal(renders.length, 1);
  assert.deepEqual(renders[0], { count: 2, tag: "second" });
});

test("an action that changes state several times rebuilds at most once per frame", async () => {
  const state = {
    view: "login",
    history: null,
    tournament: null,
    users: null,
    network: null,
  };
  let rebuildCount = 0;
  const driver = fakeFrameDriver();
  const scheduler = createRenderScheduler({
    render: () => {
      rebuildCount++;
    },
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
  });

  // Simulate sign-in action:
  // sets view to home, and kicks off 4 parallel async tasks that each update state when resolved
  async function signInFlow() {
    scheduler.update(() => {
      state.view = "home";
    });

    const loadHistory = Promise.resolve(["game1"]).then((data) => {
      scheduler.update(() => {
        state.history = data;
      });
    });

    const loadTournament = Promise.resolve({ courts: 4 }).then((data) => {
      scheduler.update(() => {
        state.tournament = data;
      });
    });

    const loadUsers = Promise.resolve([{ name: "Admin" }]).then((data) => {
      scheduler.update(() => {
        state.users = data;
      });
    });

    const loadNetwork = Promise.resolve({ ip: "192.168.1.100" }).then((data) => {
      scheduler.update(() => {
        state.network = data;
      });
    });

    await Promise.all([loadHistory, loadTournament, loadUsers, loadNetwork]);
    scheduler.update();
  }

  const promise = signInFlow();
  await promise;

  // Even though state was updated 6 times across microtasks, only 1 frame is pending
  assert.equal(driver.pendingCount(), 1);
  assert.equal(rebuildCount, 0);

  driver.triggerNextFrame();

  assert.equal(rebuildCount, 1);
  assert.deepEqual(state, {
    view: "home",
    history: ["game1"],
    tournament: { courts: 4 },
    users: [{ name: "Admin" }],
    network: { ip: "192.168.1.100" },
  });
});

test("subsequent update in a new frame triggers a new scheduled rebuild", () => {
  let renderCount = 0;
  const driver = fakeFrameDriver();
  const scheduler = createRenderScheduler({
    render: () => {
      renderCount++;
    },
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
  });

  scheduler.update();
  driver.triggerNextFrame();
  assert.equal(renderCount, 1);

  // New update in next frame
  scheduler.update();
  assert.equal(scheduler.isScheduled(), true);
  driver.triggerNextFrame();
  assert.equal(renderCount, 2);
});

test("flush executes pending render immediately and clears pending frame", () => {
  let renderCount = 0;
  const driver = fakeFrameDriver();
  const scheduler = createRenderScheduler({
    render: () => {
      renderCount++;
    },
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
  });

  scheduler.update();
  assert.equal(scheduler.isScheduled(), true);
  assert.equal(driver.pendingCount(), 1);

  scheduler.flush();

  assert.equal(renderCount, 1);
  assert.equal(scheduler.isScheduled(), false);
  assert.equal(driver.pendingCount(), 0);

  // Triggering next frame does nothing because it was cancelled/flushed
  driver.triggerNextFrame();
  assert.equal(renderCount, 1);
});

test("cancel aborts pending render without calling render", () => {
  let renderCount = 0;
  const driver = fakeFrameDriver();
  const scheduler = createRenderScheduler({
    render: () => {
      renderCount++;
    },
    requestFrame: driver.requestFrame,
    cancelFrame: driver.cancelFrame,
  });

  scheduler.update();
  assert.equal(scheduler.isScheduled(), true);

  scheduler.cancel();

  assert.equal(scheduler.isScheduled(), false);
  assert.equal(driver.pendingCount(), 0);
  assert.equal(renderCount, 0);
});
