(function () {
  "use strict";
  window.__AC_PICKLE_BUILD = "live-board-revamp1";

  const HISTORY_KEY = "ac-pickle-score-history-v1";
  const ACTIVE_KEY = "ac-pickle-score-active-v1";
  const TOURNAMENT_KEY = "ac-pickle-score-tournament-v1";
  const DATA_RESET_KEY = "ac-pickle-score-data-reset-v1";
  const API_BASE = "api";
  const DEFAULT_SUPER_ADMIN_LOGIN = "SuperAdmin_AC";
  const APP_DATA_RESET_VERSION = "cpanel-clean1";
  const LIVE_REFRESH_MS = 2000;
  // The "Updated Xs ago" cue is redrawn every tick; Qlik's reload time is re-read every 4th (~1 min).
  const RELOAD_WATCH_MS = 15000;
  const MATCH_CONTROL_ACTIONS = new Set([
    "toggle-win-by-two",
    "start-game",
    "start-default",
    "resume-game",
    "continue-recovered-match",
    "reset-recovered-match",
    "rally",
    "timeout",
    "correct-serve",
    "undo",
    "reset-active",
    "end-early",
    "start-tournament-match",
    "take-over-tournament-match",
    "toggle-tournament-win-by-two",
    "generate-open-play",
    "reset-tournament",
    "clear-tournament-results",
  ]);
  resetBrowserDataForCleanDeploy();
  const TEXT_SETUP_FIELDS = new Set([
    "scorerName",
    "teamAName",
    "teamBName",
    "teamAPlayer1",
    "teamAPlayer2",
    "teamBPlayer1",
    "teamBPlayer2",
  ]);
  const TEXT_FIELD_LIMITS = {
    scorerName: 48,
    teamAName: 32,
    teamBName: 32,
    teamAPlayer1: 32,
    teamAPlayer2: 32,
    teamBPlayer1: 32,
    teamBPlayer2: 32,
  };
  const TOURNAMENT_TEXT_FIELDS = new Set(["name", "playersText"]);
  const TOURNAMENT_NUMBER_FIELDS = new Set([
    "courts",
    "targetScore",
    "matchesPerPlayer",
    "averageGameMinutes",
    "transitionMinutes",
    "bufferMinutes",
  ]);
  let setupSaveTimer = null;
  let tournamentSaveTimer = null;
  let liveRefreshTimer = null;
  let reloadWatchTimer = null;
  let reloadWatchTicks = 0;

  const defaultSetup = {
    type: "doubles",
    scorerName: "Court 1",
    teamAName: "Team A",
    teamBName: "Team B",
    teamAPlayer1: "",
    teamAPlayer2: "",
    teamBPlayer1: "",
    teamBPlayer2: "",
    firstServer: "A",
    teamARight: 0,
    teamBRight: 0,
    targetScore: 11,
    averageGameMinutes: 15,
    transitionMinutes: 3,
    bufferMinutes: 30,
    timingVersion: 1,
    winByTwo: true,
  };

  const defaultTournament = {
    id: "open_play",
    name: "Open Play",
    courts: 2,
    matchesPerPlayer: 4,
    targetScore: 11,
    averageGameMinutes: 15,
    transitionMinutes: 3,
    bufferMinutes: 30,
    timingVersion: 1,
    winByTwo: true,
    playersText: "",
    matches: [],
    generatedAt: null,
    seed: null,
  };

  const QLIK_HOST = "https://mtcmarketing.sg.qlikcloud.com";
  const QLIK_APP_ID = "17ca2f54-46de-426c-9895-48f6c51513a3";

  const QLIK_SHEETS = [
    {
      id: "overview",
      title: "Overview",
      sheetId: "a74a9d96-0a3f-4f7d-b9f1-f91c7153dd46",
      description: "Executive KPIs, active players, completed matches, and win rate distribution.",
    },
    {
      id: "match-analysis",
      title: "Match Analysis",
      sheetId: "SAhNFmP",
      description: "Match pace, duration averages, scoring runs, and rally statistics.",
    },
    {
      id: "leaderboard",
      title: "Leaderboard",
      sheetId: "fYjcmpj",
      description: "Player standings across all events, win percentages, and point differentials.",
    },
    {
      id: "player-performance",
      title: "Player Performance",
      sheetId: "e1aac6a4-1c2f-49f9-a8c8-7ae4be857b3c",
      description: "Individual player records, win rate trends, partners, and opponent head-to-heads.",
    },
    {
      id: "partnership-analysis",
      title: "Partnership Analysis",
      sheetId: "eb45cb51-48e5-47c6-9226-90690f626f9b",
      description: "Ranked doubles partnerships (3+ matches) and pairing performance.",
    },
    {
      id: "court-analytics",
      title: "Event / Court Analytics",
      sheetId: "7cc85fc7-1896-4127-be10-b1731f626c6c",
      description: "Court utilization percentages, matches per court, and event participation.",
    },
  ];

  const session = window.PaddlePointSession.createSession({
    storages: ["localStorage", "sessionStorage"]
      .map((name) => {
        try {
          return window[name] || null;
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean),
    getUrl: () => window.location.href,
    replaceUrl: (url) => window.history.replaceState({}, "", url),
    request: (action, body, token) => postAuth(action, body, token ? { "X-Session-Token": token } : {}),
  });
  const toastManager = window.PaddlePointToast
    ? window.PaddlePointToast.createToastManager({
        container: () => document.getElementById("toast-region"),
      })
    : null;
  const viewAccess = window.PaddlePointViewAccess;
  const tournamentMatchModule = window.PaddlePointTournamentMatch || null;
  const rallyEngine = window.PaddlePointRallyEngine || null;
  const sharedStore = window.PaddlePointSharedStore
    ? window.PaddlePointSharedStore.createSharedStore({
        storage: window.localStorage,
        fetch: window.fetch.bind(window),
        session,
        apiBase: API_BASE,
        tournamentMatch: tournamentMatchModule,
        defaultTournament,
        normalizeTournament,
        mergeHistoryGames,
        isVisitorGame,
      })
    : null;
  const dialogLifecycle = window.PaddlePointDialogLifecycle || null;
  const liveBoardTabsModule = window.PaddlePointLiveBoardTabs || null;
  const scoreHighlighter = window.PaddlePointScoreHighlight ? window.PaddlePointScoreHighlight.createScoreHighlighter() : null;
  const navigationFocus = window.PaddlePointNavigationFocus || null;
  const setupValidation = window.PaddlePointSetupValidation || null;
  let pendingViewFocus = false;
  let savedLiveScoreTrigger = null;
  let savedLiveScoreTriggerElement = null;

  function pushViewUrl(view) {
    if (!viewAccess || !window.history || !window.location) return;
    const targetUrl = viewAccess.buildViewUrl(window.location.href, view);
    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    if (targetUrl !== currentUrl) {
      try {
        window.history.pushState({ view }, "", targetUrl);
      } catch (e) {}
    }
  }

  function replaceViewUrl(view) {
    if (!viewAccess || !window.history || !window.location) return;
    const targetUrl = viewAccess.buildViewUrl(window.location.href, view);
    try {
      window.history.replaceState({ view }, "", targetUrl);
    } catch (e) {}
  }

  function resolveAndSyncUrlView(fallbackView) {
    const requestedView = viewAccess && typeof viewAccess.getViewFromUrl === "function" && window.location
      ? viewAccess.getViewFromUrl(window.location.href)
      : "";
    const resolved = viewAccess.resolveView(requestedView || fallbackView || "home", session.permissions());
    const isRedirect = Boolean(requestedView && resolved.view !== requestedView);

    state.view = resolved.view;
    replaceViewUrl(resolved.view);
    if (isRedirect && resolved.message) {
      showToast(resolved.message);
    }
    return resolved;
  }

  const defaultAuthForm = {
    mode: "login",
    portal: session.portal(),
    username: "",
    password: "",
    visitorName: "",
    errors: {},
    failure: "",
    pending: false,
    registerUsername: "",
    registerDisplayName: "",
    registerPassword: "",
  };

  const defaultProfileForm = {
    displayName: "",
    password: "",
    errors: {},
    failure: "",
    success: "",
    pending: false,
  };

  const defaultNewUserForm = {
    username: "",
    displayName: "",
    password: "",
    role: "player",
    errors: {},
    failure: "",
    success: "",
    pending: false,
  };

  const defaultTournamentPlayerForm = {
    username: "",
    displayName: "",
  };

  const defaultTournamentForm = {
    errors: {},
    failure: "",
    pending: false,
  };

  const defaultStartEventForm = {
    name: "",
    courts: 2,
    failure: "",
    pending: false,
    open: false,
  };

  const SKILL_LEVEL_DEFINITIONS = [
    { value: "", label: "Unrated", description: "" },
    { value: "beginner", label: "Beginner", description: "learning the rules and serve; rallies are short." },
    { value: "intermediate", label: "Intermediate", description: "consistent serves and returns, starting to dink and stack." },
    { value: "advanced", label: "Advanced", description: "controls pace and placement, plays the kitchen deliberately." },
  ];

  function formatSkillLevel(level) {
    const key = String(level || "").toLowerCase().trim();
    if (!key || key === "unrated") return "Unrated";
    const found = SKILL_LEVEL_DEFINITIONS.find((item) => item.value === key);
    return found ? found.label : "Unrated";
  }

  function normalizePlayerNameKey(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  const savedActiveGame = loadActiveGame();
  const initialUrlView = viewAccess && typeof viewAccess.getViewFromUrl === "function" && window.location
    ? viewAccess.getViewFromUrl(window.location.href)
    : "";
  let initialResolvedView = "home";
  if (session.isSignedIn()) {
    const initialResolved = viewAccess.resolveView(initialUrlView || "home", session.permissions());
    initialResolvedView = initialResolved.view;
  }

  const state = {
    sessionRestoring: session.canRestore(),
    view: initialResolvedView,
    setup: loadSetup(),
    currentGame: savedActiveGame,
    summaryGame: null,
    dialogChoices: {},
    history: loadHistory(),
    historyStatus: "Local history loaded",
    historySource: "local",
    leaderboard: null,
    leaderboardScope: "current",
    tournament: loadTournament(),
    tournamentStatus: "Local tournament loaded",
    tournamentSource: "local",
    refreshingUsers: false,
    refreshingHistory: false,
    refreshingLeaderboard: false,
    refreshingTournament: false,
    refreshingPlayers: false,
    usersRefreshError: null,
    historyRefreshError: null,
    leaderboardRefreshError: null,
    tournamentRefreshError: null,
    playersRefreshError: null,
    lastFetched: {
      users: null,
      history: null,
      leaderboard: null,
      tournament: null,
      players: null,
    },
    authForm: { ...defaultAuthForm },
    profileForm: { ...defaultProfileForm },
    users: [],
    usersStatus: "Users not loaded yet",
    players: [],
    playersStatus: "Players not loaded yet",
    newUserForm: { ...defaultNewUserForm },
    tournamentPlayerForm: { ...defaultTournamentPlayerForm },
    rosterQuickAddName: "",
    renamePlayerForm: null,
    mergePlayerForm: null,
    tournamentForm: { ...defaultTournamentForm },
    startEventForm: { ...defaultStartEventForm },
    network: sharedStore ? sharedStore.getNetworkInfo() : { status: "Network link not loaded", preferredUrl: "", urls: [] },
    liveCourt: 1,
    liveTab: "ongoing",
    liveScoreExpanded: false,
    liveScoreFocusId: "",
    mobileNavOpen: false,
    sidebarCollapsed: false,
    recoveryPrompt: Boolean(savedActiveGame && savedActiveGame.status === "active"),
    undoStack: [],
    setupErrors: {},
    activeAnalyticsSheet: "overview",
    userCounts: null,
    loadingUserCounts: false,
    qlikReloadTime: null,
    qlikReloadedAt: null,
  };

  const app = document.getElementById("app");
  const confirmationController = dialogLifecycle && typeof dialogLifecycle.createConfirmationController === "function"
    ? dialogLifecycle.createConfirmationController({
      onChange: update,
      onSettled: restoreConfirmationFocus,
    })
    : null;

  render();
  bootstrapSession();

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("popstate", function (event) {
      if (!session.isSignedIn()) return;
      const urlView = viewAccess && typeof viewAccess.getViewFromUrl === "function" && window.location
        ? viewAccess.getViewFromUrl(window.location.href)
        : "";
      const historyView = event.state && event.state.view ? event.state.view : "";
      const targetView = historyView || urlView || "home";
      setView(targetView, { fromHistory: true });
    });

    if (window.matchMedia) {
      window.matchMedia("(max-width: 980px)").addEventListener("change", function () {
        if (!session.isSignedIn()) return;
        state.mobileNavOpen = false;
        update();
      });
    }
  }

  app.addEventListener("click", function (event) {
    if (event.target && event.target.classList && event.target.classList.contains("live-score-overlay")) {
      closeLiveScore();
      return;
    }

    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const value = button.dataset.value;

    if (action === "cancel-destructive-confirmation") {
      confirmationController.cancel();
      return;
    }
    if (action === "confirm-destructive-confirmation") {
      const fields = confirmationController.current() && confirmationController.current().fields;
      void confirmationController.confirm(fields ? { ...state.dialogChoices } : value);
      return;
    }

    if (isPlayer() && MATCH_CONTROL_ACTIONS.has(action)) {
      denyMatchControl();
      return;
    }

    if (action === "auth-mode") setAuthMode(value);
    if (action === "login-portal") setLoginPortal(value);
    if (action === "toggle-nav") toggleMobileNav();
    if (action === "close-nav") closeMobileNav();
    if (action === "toggle-sidebar") toggleSidebar();
    if (action === "register-player") registerPlayer();
    if (action === "logout") logoutUser();
    if (action === "save-profile") saveProfile();
    if (action === "create-user") createUser();
    if (action === "create-tournament-player") createTournamentPlayer();
    if (action === "add-roster-player") addRosterPlayerFromQuickAdd();
    if (action === "refresh-users") fetchUsers(true, { manual: true });
    if (action === "refresh-players") fetchPlayers(true, { manual: true });
    if (action === "start-rename-player") startRenamePlayer(value);
    if (action === "cancel-rename-player") cancelRenamePlayer();
    if (action === "save-rename-player") saveRenamePlayer();
    if (action === "start-merge-player") startMergePlayer(value);
    if (action === "cancel-merge-player") cancelMergePlayer();
    if (action === "confirm-merge-player") confirmMergePlayer(button);
    if (action === "toggle-user-active") toggleUserActive(value);
    if (action === "delete-user") deleteUser(value, button);
    if (action === "user-role") updateNewUserForm("role", value);
    if (action === "view") setView(value);
    if (action === "switch-analytics-sheet") setAnalyticsSheet(value);
    if (action === "toggle-win-by-two") {
      updateSetup({ winByTwo: !state.setup.winByTwo });
      renderNowAndFocus('[data-action="toggle-win-by-two"]');
    }
    if (action === "start-game") startGame(false, button);
    if (action === "start-default") startDefaultGame(button);
    if (action === "resume-game") resumeGame();
    if (action === "continue-recovered-match") continueRecoveredMatch();
    if (action === "reset-recovered-match") resetRecoveredMatch();
    if (action === "live-court") setLiveCourt(value);
    if (action === "live-tab") setLiveTab(value);
    if (action === "open-live-score") {
      savedLiveScoreTriggerElement = button;
      openLiveScore(value);
    }
    if (action === "close-live-score") closeLiveScore();
    if (action === "rally") applyRally(value);
    if (action === "correct-serve") correctServe(button);
    if (action === "timeout") callTimeout(value);
    if (action === "undo") undoLastRally();
    if (action === "reset-active") resetActiveGame(button);
    if (action === "end-early") endGameEarly(button);
    if (action === "clear-history") clearHistory(button);
    if (action === "refresh-history") {
      refreshSharedHistory(true, { manual: true });
    }
    if (action === "refresh-leaderboard") {
      refreshSharedLeaderboard(true, { manual: true });
    }
    if (action === "leaderboard-scope") {
      state.leaderboardScope = value === "all" ? "all" : "current";
      renderNowAndFocus(`[data-action="leaderboard-scope"][data-value="${state.leaderboardScope}"]`);
      refreshSharedLeaderboard(false);
    }
    if (action === "history-summary") openHistorySummary(value);
    if (action === "toggle-tournament-win-by-two") {
      updateTournament({ winByTwo: !state.tournament.winByTwo });
      renderNowAndFocus('[data-action="toggle-tournament-win-by-two"]');
    }
    if (action === "generate-open-play") generateOpenPlayTournament();
    if (action === "reset-tournament") resetTournament(button);
    if (action === "start-new-event") startNewEvent(button);
    if (action === "clear-tournament-results") clearTournamentResults(button);
    if (action === "start-tournament-match") startTournamentMatch(value, false, button);
    if (action === "take-over-tournament-match") takeOverTournamentMatch(value, false, button);
    if (action === "refresh-tournament") refreshSharedTournament(true, { manual: true });
  });

  app.addEventListener("input", function (event) {
    const authInput = event.target.closest("[data-auth-field]");
    if (authInput) {
      const field = authInput.dataset.authField;
      updateAuthForm(field, authInput.value);
      // Typing answers the field's error; drop it without re-rendering so focus and caret stay put.
      if (state.authForm.errors[field]) {
        delete state.authForm.errors[field];
        authInput.removeAttribute("aria-invalid");
        authInput.removeAttribute("aria-describedby");
        const error = document.getElementById(`auth-${field}-error`);
        if (error) error.remove();
      }
      return;
    }

    const profileInput = event.target.closest("[data-profile-field]");
    if (profileInput) {
      const field = profileInput.dataset.profileField;
      updateProfileForm(field, profileInput.value);
      if (state.profileForm.errors && state.profileForm.errors[field]) {
        delete state.profileForm.errors[field];
        profileInput.removeAttribute("aria-invalid");
        if (field === "password") {
          profileInput.setAttribute("aria-describedby", "profile-password-help");
        } else {
          profileInput.removeAttribute("aria-describedby");
        }
        const error = document.getElementById(`profile-${field}-error`);
        if (error) error.remove();
      }
      const failure = document.getElementById("profile-failure");
      if (failure) failure.remove();
      const success = document.getElementById("profile-success");
      if (success) success.remove();
      return;
    }

    const userInput = event.target.closest("[data-user-field]");
    if (userInput) {
      const field = userInput.dataset.userField;
      updateNewUserForm(field, userInput.value);
      if (state.newUserForm.errors && state.newUserForm.errors[field]) {
        delete state.newUserForm.errors[field];
        userInput.removeAttribute("aria-invalid");
        if (field === "password") {
          userInput.setAttribute("aria-describedby", "new-user-password-help");
        } else {
          userInput.removeAttribute("aria-describedby");
        }
        const error = document.getElementById(`new-user-${field}-error`);
        if (error) error.remove();
      }
      const failure = document.getElementById("new-user-failure");
      if (failure) failure.remove();
      const success = document.getElementById("new-user-success");
      if (success) success.remove();
      return;
    }

    const tournamentPlayerInput = event.target.closest("[data-tournament-player-field]");
    if (tournamentPlayerInput) {
      updateTournamentPlayerForm(tournamentPlayerInput.dataset.tournamentPlayerField, tournamentPlayerInput.value);
      return;
    }

    const rosterQuickAddInput = event.target.closest("[data-roster-quick-add]");
    if (rosterQuickAddInput) {
      state.rosterQuickAddName = rosterQuickAddInput.value;
      return;
    }

    const renamePlayerInput = event.target.closest("[data-rename-player-field]");
    if (renamePlayerInput && state.renamePlayerForm) {
      state.renamePlayerForm.name = renamePlayerInput.value;
      state.renamePlayerForm.failure = "";
      return;
    }

    const startEventInput = event.target.closest("[data-start-event-field]");
    if (startEventInput) {
      const field = startEventInput.dataset.startEventField;
      state.startEventForm = { ...state.startEventForm, [field]: startEventInput.value, failure: "" };
      return;
    }

    const tournamentInput = event.target.closest("[data-tournament-field]");
    if (tournamentInput) {
      const field = tournamentInput.dataset.tournamentField;
      updateTournamentField(field, tournamentInput.value);
      if (state.tournamentForm.errors && state.tournamentForm.errors[field]) {
        delete state.tournamentForm.errors[field];
        tournamentInput.removeAttribute("aria-invalid");
        const helpId = `tournament-${field}-help`;
        if (document.getElementById(helpId)) {
          tournamentInput.setAttribute("aria-describedby", helpId);
        } else {
          tournamentInput.removeAttribute("aria-describedby");
        }
        const error = document.getElementById(`tournament-${field}-error`);
        if (error) error.remove();
      }
      const failure = document.getElementById("tournament-failure");
      if (failure) {
        state.tournamentForm.failure = "";
        failure.remove();
      }
      return;
    }

    const input = event.target.closest("[data-field]");
    if (!input) return;
    updateSetupText(input.dataset.field, input.value);
  });

  app.addEventListener("submit", function (event) {
    if (event.target.matches("[data-auth-form]")) {
      event.preventDefault();
      loginUser();
      return;
    }
    if (event.target.matches("[data-new-user-form]")) {
      event.preventDefault();
      createUser();
      return;
    }
    if (event.target.matches("[data-profile-form]")) {
      event.preventDefault();
      saveProfile();
      return;
    }
    if (event.target.matches("[data-tournament-form]")) {
      event.preventDefault();
      generateOpenPlayTournament();
      return;
    }
    if (event.target.matches("[data-start-event-form]")) {
      event.preventDefault();
      startNewEvent(event.submitter);
      return;
    }
  });

  // Radios (Match Setup, Create User role): arrow keys and clicks both arrive here; focus returns to the chosen option after the re-render.
  app.addEventListener("change", function (event) {
    const userRoleChoice = event.target.closest("[data-user-role]");
    if (userRoleChoice) {
      updateNewUserForm("role", userRoleChoice.value);
      renderNowAndFocus(`[data-user-role][value="${userRoleChoice.value}"]`);
      return;
    }

    const skillSelect = event.target.closest("[data-action='set-player-skill']");
    if (skillSelect && event.target.tagName === "SELECT") {
      setPlayerSkill(skillSelect.dataset.playerId, skillSelect.value);
      return;
    }

    const mergeSurvivorSelect = event.target.closest("[data-merge-survivor-select]");
    if (mergeSurvivorSelect && state.mergePlayerForm) {
      state.mergePlayerForm.survivorId = Number(mergeSurvivorSelect.value);
      return;
    }

    const dialogChoice = event.target.closest("[data-dialog-choice]");
    if (dialogChoice) {
      const key = dialogChoice.dataset.dialogChoice;
      state.dialogChoices = { ...state.dialogChoices, [key]: dialogChoice.value };
      renderNowAndFocus(`[data-dialog-choice="${key}"]:checked`);
      return;
    }

    const choice = event.target.closest("[data-setup-choice]");
    if (!choice) return;
    const field = choice.dataset.setupChoice;
    const numericField = field === "targetScore" || field === "teamARight" || field === "teamBRight";
    updateSetup({ [field]: numericField ? Number(choice.value) : choice.value });
    renderNowAndFocus(`[data-setup-choice="${field}"]:checked`);
  });

  // <details> open state is DOM-only; keep it in state so re-renders do not collapse it.
  app.addEventListener("toggle", function (event) {
    if (event.target.matches && event.target.matches("[data-start-event-details]")) {
      state.startEventForm = { ...state.startEventForm, open: event.target.open };
    }
  }, true);

  window.addEventListener("keydown", function (event) {
    const activeDialog = getActiveDialog();

    if (activeDialog && activeDialog.classList.contains("destructive-confirmation-overlay")) {
      if (dialogLifecycle) {
        dialogLifecycle.handleDialogKeydown(event, {
          dialog: activeDialog,
          allowEscape: true,
          onEscape: confirmationController.cancel,
        });
      }
      return;
    }

    if (activeDialog && activeDialog.classList.contains("match-recovery-overlay")) {
      if (dialogLifecycle) {
        dialogLifecycle.handleDialogKeydown(event, {
          dialog: activeDialog,
          allowEscape: false,
        });
      }
      return;
    }

    if (activeDialog) {
      if (dialogLifecycle) {
        dialogLifecycle.handleDialogKeydown(event, {
          dialog: activeDialog,
          allowEscape: true,
          onEscape: closeLiveScore,
        });
      }
      return;
    }

    if (event.key === "Escape" && state.mobileNavOpen) {
      event.preventDefault();
      state.mobileNavOpen = false;
      renderNowAndFocus('.menu-toggle');
      return;
    }

    const activeTabButton = event.target && event.target.closest ? event.target.closest('.live-board-tabs [data-action="live-tab"]') : null;
    if (activeTabButton && liveBoardTabsModule) {
      const currentTab = activeTabButton.dataset.value || state.liveTab;
      const handled = liveBoardTabsModule.handleTabKeydown(event, {
        currentTab,
        onSelectTab: (newTab) => {
          setLiveTab(newTab);
          renderNowAndFocus(`#live-tab-${newTab}`);
        },
      });
      if (handled) return;
    }
  });

  function focusDialogPrimaryAction(dialogElement) {
    if (!dialogElement) return;
    const isConfirmation = dialogElement.classList.contains("destructive-confirmation-overlay");
    const isRecovery = dialogElement.classList.contains("match-recovery-overlay");
    const target = isConfirmation
      ? dialogElement.querySelector('[data-action="cancel-destructive-confirmation"]')
      : isRecovery
        ? dialogElement.querySelector('[data-action="continue-recovered-match"]')
        : dialogElement.querySelector('[data-action="close-live-score"]');
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }

  function getActiveDialog() {
    return app.querySelector(".destructive-confirmation-overlay")
      || app.querySelector(".match-recovery-overlay")
      || app.querySelector(".live-score-overlay");
  }

  document.addEventListener("focusin", function (event) {
    const activeDialog = getActiveDialog();
    if (!activeDialog) return;

    if (!activeDialog.contains(event.target)) {
      focusDialogPrimaryAction(activeDialog);
    }
  });

  document.addEventListener("click", function (event) {
    const skipLink = event.target && event.target.closest ? event.target.closest(".skip-link") : null;
    if (skipLink) {
      event.preventDefault();
      const target = document.getElementById("main-content");
      if (target && typeof target.focus === "function") {
        target.focus();
      }
    }
  });

  function syncDialogLifecycle() {
    const activeDialog = getActiveDialog();

    const chrome = app.querySelector(".app-chrome");
    const page = app.querySelector(".page");
    const backgroundElements = [chrome, page].filter(Boolean);

    if (activeDialog) {
      if (dialogLifecycle) {
        dialogLifecycle.applyInert(backgroundElements, true);
      }
      const activeEl = document.activeElement;
      if (!activeDialog.contains(activeEl)) {
        focusDialogPrimaryAction(activeDialog);
      }
    } else {
      if (dialogLifecycle) {
        dialogLifecycle.applyInert(backgroundElements, false);
      }
    }
  }

  function render() {
    const isRestoring = Boolean(state.sessionRestoring);
    const signedIn = !isRestoring && session.isSignedIn();

    document.body.classList.toggle("auth-mode", !signedIn);
    document.body.classList.toggle("admin-auth-mode", !signedIn && state.authForm.portal === "admin");
    document.body.classList.toggle("player-auth-mode", !signedIn && state.authForm.portal === "player");
    document.body.classList.toggle("visitor-auth-mode", !signedIn && state.authForm.portal === "visitor");
    document.body.classList.toggle("app-mode", signedIn);
    document.body.classList.toggle("visitor-mode", signedIn && isVisitor());
    document.body.classList.toggle("sidebar-collapsed", signedIn && state.sidebarCollapsed);
    document.body.classList.toggle("live-tv-mode", signedIn && state.view === "live");
    document.body.classList.toggle("scoreboard-mode", signedIn && (isStaff() || isVisitor()) && state.view === "scoreboard");
    document.body.classList.toggle("mobile-nav-open", signedIn && state.mobileNavOpen);

    const activeEl = document.activeElement;
    let savedFocusSelector = null;
    if (activeEl && app.contains(activeEl) && activeEl !== document.body) {
      if (activeEl.id) {
        savedFocusSelector = `#${activeEl.id}`;
      } else if (activeEl.dataset && activeEl.dataset.action && activeEl.dataset.value) {
        savedFocusSelector = `[data-action="${activeEl.dataset.action}"][data-value="${activeEl.dataset.value}"]`;
      }
    }

    let mainContentHtml = "";
    if (isRestoring) {
      mainContentHtml = renderSessionLoading();
    } else if (signedIn) {
      mainContentHtml = renderView();
    } else {
      mainContentHtml = renderLogin();
    }

    app.innerHTML = [
      signedIn ? renderHeader() : "",
      '<main id="main-content" class="page" tabindex="-1" aria-label="Main content">',
      mainContentHtml,
      "</main>",
      state.liveScoreExpanded && signedIn && isStaff() ? renderLiveScoreOverlay() : "",
      !isRestoring && hasRecoveryPrompt() ? renderRecoveryModal() : "",
      renderDestructiveConfirmation(),
    ].join("");

    if (scoreHighlighter) scoreHighlighter.apply(app);
    if (window.PaddlePointQlikMashup) window.PaddlePointQlikMashup.attach(app);

    if (!isRestoring && pendingViewFocus) {
      pendingViewFocus = false;
      if (navigationFocus) {
        navigationFocus.focusDestinationHeading(app);
        const headingTitle = navigationFocus.getViewHeadingTitle(app);
        if (headingTitle) {
          document.title = `${headingTitle} - PaddlePointer`;
        }
      }
    } else if (savedFocusSelector) {
      const elToFocus = app.querySelector(savedFocusSelector);
      if (elToFocus && typeof elToFocus.focus === "function") {
        elToFocus.focus({ preventScroll: true });
      } else if (!signedIn && !isRestoring) {
        const fallbackAuthInput = app.querySelector('[data-auth-field="username"]');
        if (fallbackAuthInput && typeof fallbackAuthInput.focus === "function") {
          fallbackAuthInput.focus({ preventScroll: true });
        }
      }
    }

    syncDialogLifecycle();
    syncLiveRefreshLoop();
    syncReloadWatchLoop();
  }

  const renderScheduler = window.PaddlePointRenderScheduler
    ? window.PaddlePointRenderScheduler.createRenderScheduler({ render })
    : null;

  function update(mutator) {
    if (renderScheduler) {
      renderScheduler.update(mutator);
      return;
    }
    if (typeof mutator === "function") {
      mutator();
    }
    render();
  }

  function syncLiveRefreshLoop() {
    const shouldRun = session.isSignedIn() && state.view === "live";
    if (shouldRun && !liveRefreshTimer) {
      liveRefreshTimer = window.setInterval(function () {
        // A hidden tab skips its ticks; the next one after it's shown catches up within 2 s.
        if (!document.hidden && session.isSignedIn() && state.view === "live") {
          refreshSharedTournament(false, { silent: true, isPoll: true });
        }
      }, LIVE_REFRESH_MS);
      return;
    }

    if (!shouldRun && liveRefreshTimer) {
      window.clearInterval(liveRefreshTimer);
      liveRefreshTimer = null;
    }
  }

  // While a staff member has a view showing Qlik data open, keep its freshness cue current and
  // pick up reloads. An open Qlik session already pushes new data into the charts (changed
  // event), so only the cue needs help. Ticks are skipped while the page is hidden.
  function reloadWatchActive() {
    return session.isSignedIn() && isStaff() && (state.view === "analytics" || state.view === "home");
  }

  function refreshReloadCue() {
    app.querySelectorAll("[data-reload-ago]").forEach((el) => {
      el.textContent = formatFreshness(state.qlikReloadedAt);
    });
  }

  function syncReloadWatchLoop() {
    const shouldRun = reloadWatchActive();
    if (shouldRun && !reloadWatchTimer) {
      reloadWatchTimer = window.setInterval(function () {
        if (document.hidden || !reloadWatchActive()) return;
        refreshReloadCue();
        if (++reloadWatchTicks % 4 === 0) fetchQlikReloadTime();
      }, RELOAD_WATCH_MS);
      return;
    }

    if (!shouldRun && reloadWatchTimer) {
      window.clearInterval(reloadWatchTimer);
      reloadWatchTimer = null;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden || !reloadWatchActive()) return;
    refreshReloadCue();
    fetchQlikReloadTime();
  });

  function renderReloadCue() {
    return state.qlikReloadedAt
      ? `<span data-reload-ago title="Data reloaded ${escapeAttr(state.qlikReloadTime)}">${escapeHtml(formatFreshness(state.qlikReloadedAt))}</span>`
      : "";
  }

  function hasRecoveryPrompt() {
    return Boolean(session.isSignedIn() && (isStaff() || isVisitor()) && state.recoveryPrompt && state.currentGame && state.currentGame.status === "active");
  }

  function renderRecoveryModal() {
    const game = state.currentGame;
    const tournamentLabel = game.tournamentMatch
      ? `Tournament match - Round ${game.tournamentMatch.round}, Court ${game.tournamentMatch.court}`
      : `${capitalize(game.type)} match`;

    return `
      <section class="match-recovery-overlay" role="alertdialog" aria-modal="true" aria-labelledby="match-recovery-title" aria-describedby="match-recovery-desc">
        <article class="match-recovery-dialog">
          <div>
            <p class="eyebrow">Match recovery</p>
            <h2 id="match-recovery-title">Continue this match?</h2>
            <p id="match-recovery-desc">This browser still has an active match after the refresh. Continue where you left off, or reset this same match back to 0-0. Resetting will clear the current match score.</p>
          </div>
          <div class="recovery-match-card">
            <span>${escapeHtml(tournamentLabel)}</span>
            <strong>${escapeHtml(gameTitle(game))}</strong>
            <div class="recovery-score-line">
              <b>${game.teamA.score}</b>
              <em>${escapeHtml(scoreCall(game))}</em>
              <b>${game.teamB.score}</b>
            </div>
          </div>
          <div class="recovery-actions">
            <button class="button primary" data-action="continue-recovered-match">Continue Match</button>
            <button class="button ghost quiet-danger" data-action="reset-recovered-match">Reset Match</button>
          </div>
        </article>
      </section>
    `;
  }

  function renderDestructiveConfirmation() {
    const confirmation = confirmationController ? confirmationController.current() : null;
    if (!confirmation) return "";

    return `
      <section class="destructive-confirmation-overlay" role="alertdialog" aria-modal="true" aria-labelledby="destructive-confirmation-title" aria-describedby="destructive-confirmation-description">
        <article class="destructive-confirmation-dialog">
          <div>
            <p class="eyebrow">${escapeHtml(confirmation.eyebrow || (confirmation.tone === "choice" ? "Before you start" : "Please confirm"))}</p>
            <h2 id="destructive-confirmation-title">${escapeHtml(confirmation.title)}</h2>
            <p id="destructive-confirmation-description">${escapeHtml(confirmation.description)}</p>
          </div>
          ${
            Array.isArray(confirmation.fields)
              ? `<div class="dialog-choice-fields">${confirmation.fields
                  .map((field) => `
                    <fieldset class="field full choice-group">
                      <legend class="label">${escapeHtml(field.legend)}</legend>
                      <div class="segmented">
                        ${field.options
                          .map(([optionValue, optionLabel]) => {
                            const checked = String(state.dialogChoices[field.key]) === String(optionValue);
                            return `
                              <label class="segment ${checked ? "active" : ""}">
                                <input type="radio" name="dialog-${escapeAttr(field.key)}" value="${escapeAttr(optionValue)}" data-dialog-choice="${escapeAttr(field.key)}"${checked ? " checked" : ""}>
                                ${escapeHtml(optionLabel)}
                              </label>
                            `;
                          })
                          .join("")}
                      </div>
                    </fieldset>
                  `)
                  .join("")}</div>`
              : ""
          }
          <div class="destructive-confirmation-actions">
            <button class="button primary" data-action="cancel-destructive-confirmation">${escapeHtml(confirmation.cancelLabel)}</button>
            ${
              Array.isArray(confirmation.choices)
                ? confirmation.choices
                    .map((choice) => `<button class="button danger" data-action="confirm-destructive-confirmation" data-value="${escapeAttr(choice.value)}">${escapeHtml(choice.label)}</button>`)
                    .join("")
                : `<button class="button ${confirmation.tone === "choice" ? "green" : "danger"}" data-action="confirm-destructive-confirmation">${escapeHtml(confirmation.confirmLabel)}</button>`
            }
          </div>
        </article>
      </section>
    `;
  }

  function logoutIconSvg() {
    return `
      <svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M10 5H6.8A1.8 1.8 0 0 0 5 6.8v10.4A1.8 1.8 0 0 0 6.8 19H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M14 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M18 12H9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  function navIconSvg(view) {
    const icons = {
      home: '<svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
      setup: '<svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      live: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M6.9 8.2a7 7 0 0 0 0 7.6M17.1 8.2a7 7 0 0 1 0 7.6M3.8 5.3a11 11 0 0 0 0 13.4M20.2 5.3a11 11 0 0 1 0 13.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      history: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M5 5.5 3.5 4M5 5.5l.2-2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      leaderboard: '<svg viewBox="0 0 24 24" focusable="false"><path d="M3 20v-6h6V8h6v4h6v8Z M9 20v-6M15 20v-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
      analytics: '<svg viewBox="0 0 24 24" focusable="false"><path d="M4 4v16h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m7.5 15 4-4.5 3 3L20 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      tournament: '<svg viewBox="0 0 24 24" focusable="false"><path d="M6 4h12v5a6 6 0 0 1-12 0V4Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 6H3v2a4 4 0 0 0 4 4M18 6h3v2a4 4 0 0 1-4 4M12 15v4M8 21h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      people: '<svg viewBox="0 0 24 24" focusable="false"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="7" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      players: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      profile: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      rules: '<svg viewBox="0 0 24 24" focusable="false"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    };
    return icons[view] || icons.home;
  }

  function chevronLeftSvg() {
    return '<svg viewBox="0 0 24 24" focusable="false"><path d="m14.5 6-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function chevronRightSvg() {
    return '<svg viewBox="0 0 24 24" focusable="false"><path d="m9.5 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function userAvatarSvg() {
    return '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.2" fill="currentColor"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0" fill="currentColor"/></svg>';
  }

  function isCompactViewport() {
    if (typeof window === "undefined") return false;
    if (window.matchMedia) {
      const mql = window.matchMedia("(max-width: 980px)");
      if (mql && typeof mql.matches === "boolean") return mql.matches;
    }
    if (typeof window.innerWidth === "number" && window.innerWidth > 0) {
      return window.innerWidth <= 980;
    }
    return false;
  }

  function closeMobileNav() {
    if (state.mobileNavOpen) {
      state.mobileNavOpen = false;
      update();
    }
  }

  function renderHeader() {
    const nav = session.isSignedIn() ? viewAccess.navigationFor(session.permissions()) : [];
    const user = session.user();
    const menuOpen = Boolean(state.mobileNavOpen);
    const sidebarCollapsed = Boolean(state.sidebarCollapsed);
    const compact = isCompactViewport();
    const menuExpanded = menuOpen ? "true" : "false";
    const menuLabel = menuOpen ? "Close navigation menu" : "Open navigation menu";
    const staff = isStaff();
    const tournament = staff ? normalizeTournament(state.tournament) : null;
    const totalMatches = staff ? tournament.matches.length : 0;
    const completedMatches = staff ? tournament.matches.filter((match) => match.status === "completed").length : 0;
    const liveCourtCount = totalMatches ? liveBoardData().liveCourts : 0;
    // Event, Results, Account: order within a group follows navigationFor.
    const navGroup = { home: 0, setup: 0, live: 0, tournament: 0, history: 1, leaderboard: 1, analytics: 1, players: 2, people: 2, profile: 2, rules: 2 };
    const groupedNav = nav.map((item, index) => ({ item, index })).sort((a, b) => (navGroup[a.item[0]] ?? 2) - (navGroup[b.item[0]] ?? 2) || a.index - b.index).map(({ item }) => item);
    const userText = user
      ? `<span class="top-user-avatar" aria-hidden="true">${userAvatarSvg()}</span>
         <span class="top-user-text">
           <span class="top-user-name">${escapeHtml(user.displayName)}</span>
           <span class="top-user-role">${escapeHtml(roleLabel(user.role))}</span>
         </span>`
      : "";

    return `
      <header class="app-chrome">
        <aside id="application-navigation" class="side-nav ${sidebarCollapsed ? "collapsed" : ""} ${menuOpen ? "mobile-open" : ""}" aria-label="Application navigation"${compact && !menuOpen ? ' aria-hidden="true"' : ""}>
          <div class="side-brand">
            <img class="side-logo side-logo-full" src="assets/paddlepoint-logo-w-2.webp" alt="PaddlePointer">
            <img class="side-logo side-logo-icon" src="assets/paddlepoint-logo-icon.webp" alt="PaddlePointer">
          </div>
          <nav class="side-menu" aria-label="Primary">
            ${groupedNav
              .map(
                ([view, label], index) => {
                  const isActive = state.view === view;
                  const startsGroup = index > 0 && navGroup[view] !== navGroup[groupedNav[index - 1][0]];
                  const badge = view === "live" && liveCourtCount ? `<span class="side-nav-badge">${liveCourtCount}<span class="sr-only"> courts live</span></span>` : "";
                  return `
                    ${startsGroup ? '<hr class="side-menu-divider">' : ""}
                    <button class="nav-btn side-nav-item ${isActive ? "active" : ""}" data-action="view" data-value="${view}" title="${escapeAttr(label)}"${isActive ? ' aria-current="page"' : ""}>
                      <span class="side-nav-icon" aria-hidden="true">${navIconSvg(view)}</span>
                      <span class="side-nav-label">${label}</span>
                      ${badge}
                    </button>
                  `;
                }
              )
              .join("")}
          </nav>
          ${
            user
              ? `<div class="side-account">
                  <span class="side-account-avatar" aria-hidden="true">${userAvatarSvg()}</span>
                  <span class="side-account-text">
                    <span class="side-account-name">${escapeHtml(user.displayName)}</span>
                    <span class="side-account-role">${escapeHtml(roleLabel(user.role))}</span>
                  </span>
                  <button class="side-account-logout" type="button" data-action="logout" aria-label="Logout" title="Logout">${logoutIconSvg()}</button>
                </div>`
              : ""
          }
          <div class="side-footer">
            <button class="sidebar-collapse" data-action="toggle-sidebar" aria-label="${sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}" title="${sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}">
              <span class="side-nav-icon" aria-hidden="true">${sidebarCollapsed ? chevronRightSvg() : chevronLeftSvg()}</span>
              <span class="side-nav-label">${sidebarCollapsed ? "Expand" : "Collapse"}</span>
            </button>
          </div>
        </aside>
        <div class="sidebar-scrim ${menuOpen ? "open" : ""}" data-action="close-nav" aria-hidden="true"></div>
        <div class="topbar">
          <button class="menu-toggle ${sidebarCollapsed ? "collapsed" : ""} ${menuOpen ? "open" : ""}" type="button" data-action="toggle-nav" aria-label="${menuLabel}" aria-expanded="${menuExpanded}" aria-controls="application-navigation">
            <img class="menu-toggle-icon" src="assets/humburger-menu.png" alt="" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <img class="topbar-logo" src="assets/paddlepoint-logo-icon.webp" alt="PaddlePointer">
          <div class="topbar-spacer">
            ${
              staff
                ? `<p class="top-event">
                    <strong class="top-event-name">${escapeHtml(cleanName(tournament.name, "Tournament"))}</strong>
                    ${
                      totalMatches
                        ? `<span class="top-event-live ${liveCourtCount ? "is-live" : ""}">${liveCourtCount ? `${liveCourtCount} court${liveCourtCount === 1 ? "" : "s"} live` : "Courts idle"}</span>
                           <span class="top-event-progress">${completedMatches}/${totalMatches} done</span>`
                        : '<span class="top-event-progress">No schedule yet</span>'
                    }
                  </p>`
                : ""
            }
          </div>
          <div class="top-actions">
            ${
              user
                ? `${
                    isSuperAdmin()
                      ? `<button class="top-user" type="button" data-action="view" data-value="profile" title="Open profile">${userText}</button>`
                      : `<div class="top-user">${userText}</div>`
                  }
                  <button class="nav-btn icon-only top-logout" data-action="logout" aria-label="Logout" title="Logout">
                    ${logoutIconSvg()}
                  </button>`
                : ""
            }
          </div>
        </div>
      </header>
    `;
  }

  function renderView() {
    if (state.view === "admin") return renderAdminDashboard();
    if (state.view === "profile") return renderProfile();
    if (state.view === "people") return isSuperAdmin() ? renderPeople() : renderHome();
    if (state.view === "players") return isStaff() ? renderPlayers() : renderHome();
    if (state.view === "home") return isStaff() ? renderAdminDashboard() : isVisitor() ? renderVisitorDashboard() : renderPlayerDashboard();
    if (state.view === "analytics") return isStaff() ? renderAnalyticsView() : renderHome();
    if (state.view === "setup") return renderSetup();
    if (state.view === "scoreboard") return isStaff() || isVisitor() ? renderScoreboard() : renderPlayerDashboard();
    if (state.view === "summary") return renderSummary();
    if (state.view === "history") return renderHistory();
    if (state.view === "live") return renderLiveView();
    if (state.view === "leaderboard") return renderLeaderboard();
    if (state.view === "tournament") return renderTournament();
    if (state.view === "rules") return renderRules();
    return renderHome();
  }

  function authPortalTheme(portal) {
    const isPlayerPortal = portal === "player";
    const isVisitorPortal = portal === "visitor";
    const isAdminPortal = !isPlayerPortal && !isVisitorPortal;
    const isDarkAuth = true;
    return { isPlayerPortal, isVisitorPortal, isAdminPortal, isDarkAuth };
  }

  function renderSessionLoading() {
    const { isPlayerPortal, isVisitorPortal, isAdminPortal, isDarkAuth } = authPortalTheme(session.portal());

    return `
      <section class="auth-shell clean-auth-shell session-loading-shell ${isDarkAuth ? "dark-auth-shell" : ""} ${isAdminPortal ? "admin-auth-shell" : ""} ${isPlayerPortal ? "player-auth-shell" : ""} ${isVisitorPortal ? "visitor-auth-shell" : ""}" aria-busy="true">
        <div class="auth-brand-rail">
          <div class="auth-login-logo">
            <img src="assets/paddlepoint-logo-w-h.webp" alt="PaddlePointer">
          </div>
          <p class="auth-brand-tagline">Tap to score.<br>Rules handled.</p>
        </div>
        <article class="auth-card session-loading-card">
          <div class="session-loading-content" role="status" aria-live="polite">
            <div class="session-loading-spinner" aria-hidden="true"></div>
            <p class="session-loading-message">Checking saved session...</p>
          </div>
        </article>
      </section>
    `;
  }

  function renderLogin() {
    const form = state.authForm;
    const { isPlayerPortal, isVisitorPortal, isAdminPortal, isDarkAuth } = authPortalTheme(form.portal);
    const portalTitle = isAdminPortal ? "Admin Sign In" : isPlayerPortal ? "Player Sign In" : "Visitor Sign In";

    return `
      <section class="auth-shell clean-auth-shell ${isDarkAuth ? "dark-auth-shell" : ""} ${isAdminPortal ? "admin-auth-shell" : ""} ${isPlayerPortal ? "player-auth-shell" : ""} ${isVisitorPortal ? "visitor-auth-shell visitor-login-shell" : ""}">
        <div class="auth-brand-rail">
          <div class="auth-login-logo">
            <img src="assets/paddlepoint-logo-w-h.webp" alt="PaddlePointer">
          </div>
          <p class="auth-brand-tagline">Tap to score.<br>Rules handled.</p>
        </div>
        <article class="auth-card">
          <div class="auth-copy">
            <h1><span class="auth-lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/></svg></span>${portalTitle}</h1>
            <p>${
              isVisitorPortal
                ? "Enter your email to create or reopen your visitor account. No password is needed."
                : isPlayerPortal
                  ? "Enter your player username to see your matches, completed results, rank, and sharing tools."
                  : "Sign in to manage tournaments, matches, live scoring, leaderboards, history, and rules."
            }</p>
          </div>
          <form class="form-grid auth-form" data-auth-form novalidate>
            <label class="field">
              <span class="label">${isVisitorPortal ? "Email" : "Username"}</span>
              <input class="input" ${isVisitorPortal ? 'type="email" ' : ""}name="username" data-auth-field="username" value="${escapeAttr(form.username)}" placeholder="${isVisitorPortal ? "you@example.com" : isPlayerPortal ? "player username" : "Admin username"}" autocomplete="${isVisitorPortal ? "email" : "username"}" required${authFieldAttrs("username")}>
              ${authFieldError("username")}
            </label>
            ${
              isVisitorPortal
                ? `<label class="field">
                    <span class="label">Full name (optional)</span>
                    <input class="input" name="visitorName" data-auth-field="visitorName" value="${escapeAttr(form.visitorName)}" placeholder="Name for visitor leaderboard" autocomplete="name">
                  </label>`
                : isPlayerPortal
                ? `<div class="field helper-card login-helper-card">
                    <span class="label">Password</span>
                    <strong>Not needed</strong>
                    <span>Players only enter their assigned username.</span>
                  </div>`
                : `<label class="field">
                    <span class="label">Password</span>
                    <input class="input" type="password" name="password" data-auth-field="password" value="${escapeAttr(form.password)}" placeholder="Admin password" autocomplete="current-password" required${authFieldAttrs("password")}>
                    ${authFieldError("password")}
                  </label>`
            }
            ${form.failure ? `<div class="auth-failure full-width" id="auth-failure">${escapeHtml(form.failure)}</div>` : ""}
            <div class="row-actions full-width">
              <button class="button primary" type="submit"${form.pending ? ' disabled aria-busy="true"' : ""}${form.failure ? ' aria-describedby="auth-failure"' : ""}>${form.pending ? "Signing in…" : "Sign In"}</button>
            </div>
            <div class="auth-portal-switch full-width" role="group" aria-label="Sign-in portals">
              <div class="auth-portal-status">Switch portal:</div>
              <div class="auth-portal-actions">
                ${renderLoginPortalButtons(form.portal)}
              </div>
            </div>
          </form>
        </article>
      </section>
    `;
  }

  function authFieldAttrs(field) {
    return state.authForm.errors[field] ? ` aria-invalid="true" aria-describedby="auth-${field}-error"` : "";
  }

  function authFieldError(field) {
    const message = state.authForm.errors[field];
    return message ? `<span class="field-error" id="auth-${field}-error">${escapeHtml(message)}</span>` : "";
  }

  function renderLoginPortalButtons(activePortal) {
    return [
      ["admin", "Admin Sign In"],
      ["player", "Player Sign In"],
      ["visitor", "Visitor Sign In"],
    ]
      .filter(([portal]) => portal !== activePortal)
      .map(
        ([portal, label]) => `
          <button class="button ghost" type="button" data-action="login-portal" data-value="${portal}">
            ${label}
          </button>
        `
      )
      .join("");
  }

  function renderPeople() {
    const users = state.users;
    const activeUsers = users.filter((user) => user.isActive).length;
    const playerCount = users.filter((user) => user.role === "player").length;
    const staffCount = users.filter((user) => user.role === "admin" || user.role === "super_admin").length;
    return `
      <section class="page-title people-title">
        <div>
          <span class="eyebrow">Access control</span>
          <h1>People</h1>
          <p>Create accounts, share the player join link, and manage who can access PaddlePointer.${state.lastFetched.users ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.users, state.refreshingUsers)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <button class="button ghost" data-action="refresh-users"${state.refreshingUsers ? ' disabled aria-busy="true"' : ""}>${state.refreshingUsers ? "Refreshing…" : "Refresh"}</button>
        </div>
      </section>

      ${renderRefreshErrorBanner(state.usersRefreshError, "refresh-users")}

      <section class="people-overview" aria-label="People summary">
        <div class="people-stat people-stat-primary"><span>Total accounts</span><strong>${users.length}</strong></div>
        <div class="people-stat"><span>Active access</span><strong>${activeUsers}</strong></div>
        <div class="people-stat"><span>Players</span><strong>${playerCount}</strong></div>
        <div class="people-stat"><span>Staff</span><strong>${staffCount}</strong></div>
      </section>

      <section class="admin-grid people-workspace section">
        <article class="panel people-create-card">
          <div class="people-card-heading">
            <div><h2>Create account</h2><p>Add a player or an event administrator.</p></div>
          </div>
          ${renderCreateUserForm()}
        </article>
        <article class="panel wide-panel people-directory ${state.refreshingUsers ? "is-updating" : ""}" ${state.refreshingUsers ? 'aria-busy="true"' : ""}>
          <div class="panel-head">
            <div>
              <span class="label">Account directory</span>
              <h2>Players and staff</h2>
              <p>${escapeHtml(state.usersStatus)}${state.lastFetched.users ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.users, state.refreshingUsers)}</span>` : ""}</p>
            </div>
            <div class="row-actions">
              ${state.refreshingUsers ? '<span class="data-updating-badge" role="status">Updating…</span>' : ""}
            </div>
          </div>
          ${users.length ? renderUsersTable(users) : '<p class="leaderboard-empty">No users loaded yet.</p>'}
        </article>
      </section>
    `;
  }

  function renderPlayers() {
    const players = state.players;
    return `
      <section class="page-title people-title">
        <div>
          <span class="eyebrow">Match participants</span>
          <h1>Players</h1>
          <p>Every Player recorded across Matches, kept as one lasting identity even when a name is retyped.${state.lastFetched.players ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.players, state.refreshingPlayers)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <button class="button ghost" data-action="refresh-players"${state.refreshingPlayers ? ' disabled aria-busy="true"' : ""}>${state.refreshingPlayers ? "Refreshing…" : "Refresh"}</button>
        </div>
      </section>

      ${renderRefreshErrorBanner(state.playersRefreshError, "refresh-players")}

      <section class="admin-grid people-workspace section">
        <article class="panel wide-panel people-directory ${state.refreshingPlayers ? "is-updating" : ""}" ${state.refreshingPlayers ? 'aria-busy="true"' : ""}>
          <div class="panel-head">
            <div>
              <span class="label">Player directory</span>
              <h2>${players.length} Player${players.length === 1 ? "" : "s"}</h2>
              <p>${escapeHtml(state.playersStatus)}${state.lastFetched.players ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.players, state.refreshingPlayers)}</span>` : ""}</p>
            </div>
            <div class="row-actions">
              ${state.refreshingPlayers ? '<span class="data-updating-badge" role="status">Updating…</span>' : ""}
            </div>
          </div>
          ${players.length ? renderPlayersTable(players) : '<p class="leaderboard-empty">No Players recorded yet.</p>'}
        </article>
      </section>
    `;
  }

  function renderPlayersTable(players) {
    return `
      <div class="leaderboard-table-wrap users-table-wrap">
        <table class="leaderboard-table users-table players-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Skill Level</th>
              <th>Matches</th>
              <th>Events</th>
              <th>Account</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${players.map(renderPlayerRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPlayerRow(player) {
    const form = state.renamePlayerForm;
    const isRenaming = form && form.id === player.id;
    const mergeForm = state.mergePlayerForm;
    const isMerging = mergeForm && mergeForm.absorbedId === player.id;

    if (isMerging) {
      const candidates = (state.players || []).filter((p) => p.id !== player.id);
      const selectedSurvivorId = mergeForm.survivorId || (candidates[0] ? candidates[0].id : "");
      return `
        <tr>
          <td data-label="Name" colspan="5">
            <div class="rename-player-form merge-player-form">
              <span class="label">Merge into:</span>
              <select class="input select" data-merge-survivor-select aria-label="Surviving player to merge ${escapeAttr(player.name)} into"${mergeForm.pending ? " disabled" : ""}>
                ${candidates.map((c) => `
                  <option value="${escapeAttr(c.id)}"${String(selectedSurvivorId) === String(c.id) ? " selected" : ""}>${escapeHtml(c.name)}</option>
                `).join("")}
              </select>
              ${mergeForm.failure ? `<span class="field-error">${escapeHtml(mergeForm.failure)}</span>` : ""}
            </div>
          </td>
          <td data-label="Action">
            <div class="user-row-actions">
              <button class="table-action activate" data-action="confirm-merge-player"${mergeForm.pending || !candidates.length ? ' disabled aria-busy="true"' : ""}>${mergeForm.pending ? "Merging…" : "Merge…"}</button>
              <button class="table-action" data-action="cancel-merge-player"${mergeForm.pending ? " disabled" : ""}>Cancel</button>
            </div>
          </td>
        </tr>
      `;
    }

    if (!isRenaming) {
      return `
        <tr>
          <td data-label="Name"><strong>${escapeHtml(player.name)}</strong></td>
          <td data-label="Skill Level">
            <select class="input select player-skill-picker" data-action="set-player-skill" data-player-id="${escapeAttr(player.id)}" aria-label="Skill level for ${escapeAttr(player.name)}">
              ${SKILL_LEVEL_DEFINITIONS.map(
                (def) => `
                <option value="${escapeAttr(def.value)}"${(player.skillLevel || "") === def.value ? " selected" : ""}>${escapeHtml(def.description ? `${def.label}: ${def.description}` : def.label)}</option>
              `
              ).join("")}
            </select>
          </td>
          <td data-label="Matches">${escapeHtml(player.matchCount)}</td>
          <td data-label="Events">${escapeHtml(player.eventCount)}</td>
          <td data-label="Account">${player.hasAccount ? "Linked" : "None"}</td>
          <td data-label="Action">
            <div class="user-row-actions">
              <button class="table-action" data-action="start-rename-player" data-value="${escapeAttr(player.id)}">Rename</button>
              <button class="table-action" data-action="start-merge-player" data-value="${escapeAttr(player.id)}">Merge</button>
            </div>
          </td>
        </tr>
      `;
    }
    return `
      <tr>
        <td data-label="Name" colspan="5">
          <div class="rename-player-form">
            <input class="input" data-rename-player-field value="${escapeAttr(form.name)}" aria-label="New name for ${escapeAttr(player.name)}"${form.pending ? " disabled" : ""}>
            ${form.failure ? `<span class="field-error">${escapeHtml(form.failure)}</span>` : ""}
          </div>
        </td>
        <td data-label="Action">
          <div class="user-row-actions">
            <button class="table-action activate" data-action="save-rename-player"${form.pending ? ' disabled aria-busy="true"' : ""}>${form.pending ? "Saving…" : "Save"}</button>
            <button class="table-action" data-action="cancel-rename-player"${form.pending ? " disabled" : ""}>Cancel</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderAdminDashboard() {
    const games = state.history;
    const tournament = normalizeTournament(state.tournament);
    const tournamentStats = buildTournamentStats(tournament);
    const totalMatches = tournament.matches.length;
    const completedMatches = tournament.matches.filter((match) => match.status === "completed").length;
    const liveBoard = liveBoardData();
    const scheduledMatches = liveBoard.nextMatches || [];
    const nextMatch = scheduledMatches[0] || null;
    const activeGame = state.currentGame && state.currentGame.status === "active" ? state.currentGame : null;
    const ongoingSlots = liveBoard.ongoingSlots || [];
    const liveCourtCount = liveBoard.liveCourts;
    const openCourtCount = liveBoard.openCourts;
    const ongoingMatches = tournament.matches
      .filter((match) => match.status === "in_progress")
      .sort((a, b) => (a.round || 0) - (b.round || 0) || (a.court || 0) - (b.court || 0) || String(a.id || "").localeCompare(String(b.id || "")));
    const leader = tournamentStats.rows.filter((row) => row.games > 0)[0] || null;
    const userCounts = state.userCounts || {
      super_admin: "-",
      admin: "-",
      player: "-",
      visitor: "-",
      totalActive: "-",
      totalInactive: 0,
    };

    let primaryAction = "";
    if (activeGame) {
      primaryAction = '<button class="button primary" data-action="resume-game">Resume Match</button>';
    } else if (nextMatch) {
      primaryAction = `<button class="button primary" data-action="start-tournament-match" data-value="${escapeAttr(nextMatch.id)}">Start Next Match (Court ${nextMatch.court})</button>`;
    } else if (totalMatches > 0 && completedMatches === totalMatches) {
      primaryAction = '<button class="button primary" data-action="view" data-value="leaderboard">View Leaderboard</button>';
    } else if (totalMatches === 0 && isSuperAdmin()) {
      primaryAction = '<button class="button primary" data-action="view" data-value="tournament">Set Up Tournament</button>';
    } else if (totalMatches === 0) {
      primaryAction = '<button class="button primary" data-action="view" data-value="live">Open Live Board</button>';
    } else {
      primaryAction = '<button class="button primary" data-action="view" data-value="tournament">Tournament Workspace</button>';
    }

    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">${isSuperAdmin() ? "Super Admin dashboard" : "Admin dashboard"}</p>
          <h1>${isSuperAdmin() ? "Tournament control center" : "Match operations"}</h1>
          <p>${isSuperAdmin() ? "Oversee active matches, scheduled court operations, live status, and tournament progress." : "Run scheduled tournament matches, monitor live courts, and review match history."}${state.lastFetched.tournament ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.tournament, state.refreshingTournament)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          ${primaryAction}
          <button class="button ghost" data-action="refresh-tournament"${state.refreshingTournament ? ' disabled aria-busy="true"' : ""}>${state.refreshingTournament ? "Refreshing…" : "Refresh"}</button>
        </div>
      </section>

      ${isSuperAdmin() && session.user()?.usingDefaultPassword ? '<div class="data-refresh-error-banner default-password-banner" role="alert"><span>You\'re still using the default password.</span> <button class="button small ghost" type="button" data-action="view" data-value="profile">Change it in Profile.</button></div>' : ""}

      ${renderRefreshErrorBanner(state.tournamentRefreshError, "refresh-tournament")}

      <section class="dashboard-lead-grid section ${state.refreshingTournament ? "is-updating" : ""}" ${state.refreshingTournament ? 'aria-busy="true"' : ""} aria-label="Operational status">
        <article class="panel lead-status-card lead-status-primary ${activeGame ? "is-live" : ""}">
          <div class="lead-status-head">
            <span class="label">Active Match</span>
            ${activeGame ? '<span class="status-pill in_progress">Scoring</span>' : ongoingMatches.length ? '<span class="status-pill in_progress">Ongoing</span>' : '<span class="status-pill resting">Idle</span>'}
          </div>
          <div class="lead-status-body">
            ${
              activeGame
                ? `<div class="lead-scoreline">
                     <div class="lead-score-team"><span>${escapeHtml(activeGame.teamA.name)}</span><b>${activeGame.teamA.score}</b></div>
                     <div class="lead-score-team"><span>${escapeHtml(activeGame.teamB.name)}</span><b>${activeGame.teamB.score}</b></div>
                   </div>
                   <p>${activeGame.tournamentMatch ? `Round ${activeGame.tournamentMatch.round}, Court ${activeGame.tournamentMatch.court}` : "Standalone match"}. Call: <strong>${escapeHtml(scoreCall(activeGame))}</strong></p>
                   <span class="muted-note">Live scoring in progress on this device.</span>`
                : ongoingMatches.length
                ? `<strong>${ongoingMatches[0].teamA.map(escapeHtml).join("/")} vs ${ongoingMatches[0].teamB.map(escapeHtml).join("/")}</strong>
                   <p>Court ${ongoingMatches[0].court}, Round ${ongoingMatches[0].round}${ongoingMatches[0].startedBy && ongoingMatches[0].startedBy.displayName ? `, started by ${escapeHtml(ongoingMatches[0].startedBy.displayName)}` : ""}</p>
                   <span class="muted-note">Match ongoing on another device.</span>`
                : `<strong>No active match</strong>
                   <p>All courts are clear or waiting for the next match.</p>`
            }
          </div>
        </article>

        <article class="panel lead-status-card">
          <div class="lead-status-head">
            <span class="label">Next Match</span>
            ${nextMatch ? '<span class="status-pill scheduled">Scheduled</span>' : totalMatches > 0 && completedMatches === totalMatches ? '<span class="status-pill completed">Completed</span>' : '<span class="status-pill resting">None</span>'}
          </div>
          <div class="lead-status-body">
            ${
              nextMatch
                ? `<strong>${nextMatch.teamA.map(escapeHtml).join(" / ")} vs ${nextMatch.teamB.map(escapeHtml).join(" / ")}</strong>
                   <p>Court ${nextMatch.court}, Round ${nextMatch.round}, target ${tournament.targetScore || 11}</p>
                   <span class="muted-note">Queued to start next on Court ${nextMatch.court}.</span>`
                : totalMatches > 0 && completedMatches === totalMatches
                ? `<strong>All matches completed</strong>
                   <p>All ${totalMatches} scheduled tournament matches are finished.</p>`
                : `<strong>No scheduled matches</strong>
                   <p>${isSuperAdmin() ? "Generate matches in Tournament to populate schedule." : "No tournament matches queued."}</p>`
            }
          </div>
        </article>

        <article class="panel lead-status-card">
          <div class="lead-status-head">
            <span class="label">Live Courts</span>
            <span class="status-pill ${liveCourtCount ? "in_progress" : "resting"}">${liveCourtCount ? `${liveCourtCount} Live` : "Idle"}</span>
          </div>
          <div class="lead-status-body">
            <strong>${liveCourtCount ? `${liveCourtCount} court${liveCourtCount === 1 ? "" : "s"} live` : "Courts idle"}</strong>
            <p>${openCourtCount} open court${openCourtCount === 1 ? "" : "s"}, ${ongoingSlots.length} monitored</p>
            ${ongoingSlots.length ? `<ol class="court-strip" aria-hidden="true">${ongoingSlots.map((slot, index) => `<li class="${slot && slot.statusType === "live" ? "is-live" : ""}" title="Court ${index + 1}: ${slot && slot.statusType === "live" ? "live" : "open"}">${index + 1}</li>`).join("")}</ol>` : ""}
            <button class="button ghost full-width" data-action="view" data-value="live">Open Live Board</button>
          </div>
        </article>

        <article class="panel lead-status-card">
          <div class="lead-status-head">
            <span class="label">Tournament</span>
            <span class="status-pill">${completedMatches}/${totalMatches} Done</span>
          </div>
          <div class="lead-status-body">
            <strong>${escapeHtml(cleanName(tournament.name, "Tournament"))}</strong>
            ${totalMatches ? `<progress class="lead-progress" max="${totalMatches}" value="${completedMatches}" aria-label="Matches completed">${completedMatches} of ${totalMatches}</progress>` : ""}
            <p>${leader ? `Leader: <strong>${escapeHtml(leader.name)}</strong> (${leader.wins}W, +${leader.diff})` : totalMatches ? "No completed results yet" : "Not configured"}</p>
            <button class="button ghost full-width" data-action="view" data-value="tournament">Tournament Workspace</button>
          </div>
        </article>
      </section>

      <section class="dashboard-analytics-summary section" aria-label="Platform & Analytics Summary">
        <div class="dashboard-summary-grid">
          <article class="panel summary-users-card">
            <div class="panel-head">
              <div>
                <h2>User Accounts</h2>
                <p>Community members registered by role</p>
              </div>
              ${isSuperAdmin() ? '<button class="button ghost" data-action="view" data-value="people">Manage Users</button>' : ""}
            </div>
            <div class="users-stat-grid">
              ${[["super_admin", "Super Admins"], ["admin", "Admins"], ["player", "Players"], ["visitor", "Visitors"]]
                .map(
                  ([role, label]) => `
                    <div class="user-stat-tile">
                      <span class="user-stat-role">${label}</span>
                      <strong class="user-stat-num">${userCounts[role]}</strong>
                      ${userCounts.totalActive > 0 ? `<progress class="lead-progress" max="${userCounts.totalActive}" value="${userCounts[role]}" aria-label="${label} share of active users">${userCounts[role]} of ${userCounts.totalActive}</progress>` : ""}
                    </div>
                  `
                )
                .join("")}
            </div>
            <div class="summary-card-footer">
              <span class="muted-note">${userCounts.totalActive !== "-" ? `${userCounts.totalActive} active user${userCounts.totalActive === 1 ? "" : "s"}` : "Loading users..."}${userCounts.totalInactive ? ` · ${userCounts.totalInactive} inactive` : ""}</span>
            </div>
          </article>

          <article class="panel summary-chart-card">
            <div class="panel-head">
              <div>
                <h2>Matches Over Time</h2>
                <p>Tournament & standalone matches across events</p>
              </div>
              <button class="button ghost" data-action="view" data-value="analytics">Open Full Analytics</button>
            </div>
            ${state.qlikReloadedAt ? `<p class="reload-line">${renderReloadCue()}</p>` : ""}
            <div class="summary-chart-slot">
              <div data-qlik-mashup="dashboard"></div>
            </div>
          </article>
        </div>
      </section>

      <section class="dashboard-grid section">
        <article class="panel">
          <div class="panel-head">
            <div>
              <h2>Upcoming matches</h2>
              <p>${scheduledMatches.length} scheduled match${scheduledMatches.length === 1 ? "" : "es"}</p>
            </div>
            <button class="button ghost" data-action="view" data-value="tournament">Full Schedule</button>
          </div>
          ${tournament.matches.filter((match) => match.status !== "completed").slice(0, 5).map(renderCompactMatch).join("") || '<p class="leaderboard-empty">No scheduled matches.</p>'}
        </article>
        <article class="panel">
          <div class="panel-head">
            <div>
              <h2>Recent matches</h2>
              <p>${games.length} saved match${games.length === 1 ? "" : "es"}</p>
            </div>
            <button class="button ghost" data-action="view" data-value="history">Match History</button>
          </div>
          ${games.slice(0, 5).map(renderCompactGame).join("") || '<p class="leaderboard-empty">No saved matches yet.</p>'}
        </article>
      </section>
    `;
  }

  function renderAnalyticsView() {
    const activeSheet = QLIK_SHEETS.find((s) => s.id === state.activeAnalyticsSheet) || QLIK_SHEETS[0];

    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">Analytics</p>
          <h1>${escapeHtml(activeSheet.title)}</h1>
          <p>${escapeHtml(activeSheet.description)}${state.qlikReloadedAt ? ` <span class="data-freshness-cue">${renderReloadCue()}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <a class="button ghost" href="${QLIK_HOST}/sense/app/${QLIK_APP_ID}/sheet/${activeSheet.sheetId}/state/analysis" target="_blank" rel="noopener noreferrer">
            Open in Qlik Cloud
          </a>
        </div>
      </section>

      <nav class="analytics-subnav" aria-label="Analytics subjects">
        ${QLIK_SHEETS.map((sheet) => `
          <button class="analytics-tab-btn ${sheet.id === activeSheet.id ? "active" : ""}"${sheet.id === activeSheet.id ? ' aria-current="page"' : ""} data-action="switch-analytics-sheet" data-value="${escapeAttr(sheet.id)}">
            ${escapeHtml(sheet.title)}
          </button>
        `).join("")}
      </nav>

      <article class="panel analytics-sheet-panel">
        <div class="analytics-sheet-frame">
          <div data-qlik-mashup="${escapeAttr(activeSheet.id)}"></div>
        </div>

      </article>
    `;
  }

  function renderPlayerDashboard() {
    const user = session.user();
    const games = visibleHistory();
    const tournamentMatches = playerTournamentMatches();
    const nextMatches = tournamentMatches.filter((match) => match.status !== "completed").slice(0, 5);
    const completedMatches = tournamentMatches.filter((match) => match.status === "completed");
    const tournamentStats = buildTournamentStats(state.tournament);
    const playerRankIndex = tournamentStats.rows.findIndex((row) => sameName(row.name, user.displayName) || sameName(row.name, user.username));
    const playerRow = playerRankIndex >= 0 ? tournamentStats.rows[playerRankIndex] : null;
    const latestGame = games.find((game) => game && game.status === "completed");

    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">Player page</p>
          <h1>${escapeHtml(user.displayName)}</h1>
          <p>Your page shows only your upcoming matches, ended matches, current rank, and result sharing tools.</p>
        </div>
      </section>

      <section class="dashboard-grid section">
        <article class="panel metric-panel">
          <span>My rank</span>
          <strong>${playerRankIndex >= 0 ? `#${playerRankIndex + 1}` : "-"}</strong>
          <p>${playerRow ? `${playerRow.wins} wins, ${playerRow.games} played, ${playerRow.minutesPlayed || 0} min` : "No tournament result yet"}</p>
        </article>
        <article class="panel metric-panel">
          <span>Upcoming matches</span>
          <strong>${nextMatches.length}</strong>
          <p>${nextMatches.length ? "Next match is ready" : "No pending match assigned"}</p>
        </article>
        <article class="panel metric-panel">
          <span>Ended matches</span>
          <strong>${completedMatches.length + games.length}</strong>
          <p>${escapeHtml(historyStatusText(games))}</p>
        </article>
      </section>

      <section class="dashboard-grid section">
        <article class="panel">
          <h2>My upcoming matches</h2>
          ${nextMatches.map(renderCompactMatch).join("") || '<p class="leaderboard-empty">You have no upcoming tournament match right now.</p>'}
        </article>
        <article class="panel">
          <h2>My ended tournament matches</h2>
          ${completedMatches.slice(0, 5).map(renderCompactMatch).join("") || '<p class="leaderboard-empty">No ended tournament match yet.</p>'}
        </article>
      </section>

      <section class="dashboard-grid section">
        <article class="panel">
          <h2>My saved results</h2>
          ${games.slice(0, 5).map(renderCompactGame).join("") || '<p class="leaderboard-empty">No saved match result yet.</p>'}
        </article>
        <article class="panel">
          <h2>Latest result</h2>
          ${
            latestGame
              ? `<p class="muted-note">${escapeHtml(gameTitle(latestGame))} - ${escapeHtml(finalScore(latestGame))}</p>
                 <button class="button ghost" data-action="history-summary" data-value="${escapeAttr(latestGame.id)}">Open Summary</button>`
              : '<p class="leaderboard-empty">Finish a match to see it here.</p>'
          }
        </article>
      </section>
    `;
  }

  function renderVisitorDashboard() {
    const user = session.user();
    const games = visitorGames();
    const myGames = visitorSelfGames().slice(0, 5);
    const otherGames = visitorOtherGames().slice(0, 5);
    const stats = state.leaderboard || buildLeaderboardStats(games);
    const playerRows = stats.playerRows.slice(0, 8);
    const displayName = cleanName(user && user.displayName, user && user.username ? user.username : "visitor");
    const activeGame = state.currentGame && state.currentGame.status === "active" ? state.currentGame : null;

    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">Visitor page</p>
          <h1>Welcome back ${escapeHtml(displayName)}!</h1>
          <p>Start casual matches, review visitor match history, and follow the permanent visitor leaderboard.${state.lastFetched.history ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.history, state.refreshingHistory)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <button class="button primary" data-action="${activeGame ? "resume-game" : "view"}" data-value="setup">${activeGame ? "Resume Match" : "New Match"}</button>
          <button class="button ghost" data-action="refresh-history"${state.refreshingHistory ? ' disabled aria-busy="true"' : ""}>${state.refreshingHistory ? "Refreshing…" : "Refresh"}</button>
        </div>
      </section>

      ${renderRefreshErrorBanner(state.historyRefreshError, "refresh-history")}

      <section class="dashboard-grid section">
        <article class="panel metric-panel">
          <span>My matches</span>
          <strong>${myGames.length}</strong>
          <p>${myGames.length ? "Saved under your visitor email" : "No visitor matches yet"}</p>
        </article>
        <article class="panel metric-panel">
          <span>Visitor matches</span>
          <strong>${games.length}</strong>
          <p>Permanent shared visitor history</p>
        </article>
        <article class="panel metric-panel">
          <span>Leaderboard players</span>
          <strong>${stats.playerRows.length}</strong>
          <p>Visitor-only standings</p>
        </article>
      </section>

      <section class="dashboard-grid section">
        <article class="panel">
          <h2>Add full names before matches</h2>
          <p>Use the player name fields on New Match before starting. Those names are what the visitor leaderboard ranks, so full names make the standings easier to read.</p>
          <button class="button green" data-action="view" data-value="setup">New Match</button>
        </article>
        <article class="panel">
          <h2>My match history</h2>
          ${myGames.map(renderCompactGame).join("") || '<p class="leaderboard-empty">No saved visitor matches yet.</p>'}
        </article>
      </section>

      <section class="dashboard-grid section">
        <article class="panel">
          <h2>Other visitor matches</h2>
          ${otherGames.map(renderVisitorOtherGame).join("") || '<p class="leaderboard-empty">No other visitor matches yet.</p>'}
        </article>
        <article class="panel">
          <h2>Visitor leaderboard</h2>
          ${
            playerRows.length
              ? `<div class="top-player-list">${playerRows.map(renderTopPlayerRow).join("")}</div>`
              : '<p class="leaderboard-empty">Finish a visitor match to start the leaderboard.</p>'
          }
        </article>
      </section>
    `;
  }

  function renderVisitorOtherGame(game) {
    const owner = visitorGameOwnerName(game);
    const winner = game.winner ? teamName(game, game.winner) : "No winner";
    return `
      <article class="compact-row">
        <div>
          <strong>${escapeHtml(owner)}</strong>
          <span>${escapeHtml(gameTitle(game))} - ${escapeHtml(formatDateTime(game.endedAt || game.createdAt))}</span>
        </div>
        <button class="winner-badge" data-action="history-summary" data-value="${escapeAttr(game.id)}"><span>${escapeHtml(finalScore(game))} - ${escapeHtml(winner)}</span></button>
      </article>
    `;
  }

  function renderProfile() {
    const user = session.user();
    const form = state.profileForm.displayName !== undefined && state.profileForm.displayName !== "" ? state.profileForm : { ...state.profileForm, displayName: user.displayName };
    const canHavePassword = Boolean(session.permissions() && session.permissions().have_password) || isStaff();
    const initial = String(user.displayName || user.username || "P").trim().charAt(0).toUpperCase();

    return `
      <section class="page-title profile-title">
        <div>
          <span class="eyebrow">Your account</span>
          <h1>Profile settings</h1>
          <p>Keep your name current across tournaments and match history.</p>
        </div>
      </section>
      <section class="profile-layout">
        <aside class="profile-identity" aria-label="Account summary">
          <div class="profile-monogram" aria-hidden="true">${escapeHtml(initial)}</div>
          <div class="profile-identity-copy">
            <span class="profile-kicker">Signed in as</span>
            <h2>${escapeHtml(user.displayName)}</h2>
            <p>@${escapeHtml(user.username)}</p>
          </div>
          <dl class="profile-facts">
            <div><dt>Role</dt><dd>${escapeHtml(roleLabel(user.role))}</dd></div>
            <div><dt>Status</dt><dd><span class="profile-status-dot${user.isActive ? "" : " is-inactive"}" aria-hidden="true"></span>${user.isActive ? "Active" : "Inactive"}</dd></div>
          </dl>
        </aside>
        <article class="panel profile-form-card">
          <header class="profile-form-head">
            <div>
              <span class="label">Account details</span>
              <h2>How you appear</h2>
            </div>
            <span class="profile-username">@${escapeHtml(user.username)}</span>
          </header>
          <form class="form-grid profile-form" data-profile-form novalidate>
            <label class="field full">
              <span class="label">Display name</span>
              <input class="input" name="displayName" data-profile-field="displayName" value="${escapeAttr(form.displayName)}" maxlength="120" required${profileFieldAttrs("displayName")}>
              <span class="field-help">Used on scoreboards, tournament records, and match history.</span>
              ${profileFieldError("displayName")}
            </label>
            ${
              canHavePassword
                ? `<label class="field full">
                    <span class="label">New password</span>
                    <input class="input" type="password" name="password" data-profile-field="password" value="${escapeAttr(form.password)}" placeholder="Leave blank to keep current password" autocomplete="new-password"${profileFieldAttrs("password", "profile-password-help")}>
                    <span class="field-help" id="profile-password-help">Leave blank to keep current password, or enter at least 6 characters.</span>
                    ${profileFieldError("password")}
                  </label>`
                : `<div class="field full helper-card">
                    <span class="label">Password</span>
                    <strong>Not required</strong>
                    <span>Players and Visitors sign in without a password.</span>
                  </div>`
            }
            ${form.failure ? `<div class="form-failure full-width" id="profile-failure" role="alert">${escapeHtml(form.failure)}</div>` : ""}
            ${form.success ? `<div class="form-success full-width" id="profile-success" role="status" aria-live="polite">${escapeHtml(form.success)}</div>` : ""}
            <div class="row-actions full-width">
              <button class="button primary" type="submit"${form.pending ? ' disabled aria-busy="true"' : ""}>${form.pending ? "Saving…" : "Save changes"}</button>
              <button class="button ghost" type="button" data-action="view" data-value="home">Back</button>
            </div>
          </form>
        </article>
      </section>
    `;
  }

  function profileFieldAttrs(field, helpId) {
    const hasError = Boolean(state.profileForm.errors && state.profileForm.errors[field]);
    const errorId = `profile-${field}-error`;
    const describedBy = [helpId, hasError ? errorId : ""].filter(Boolean).join(" ");
    const ariaDesc = describedBy ? ` aria-describedby="${describedBy}"` : "";
    const ariaInv = hasError ? ' aria-invalid="true"' : "";
    return `${ariaInv}${ariaDesc}`;
  }

  function profileFieldError(field) {
    const message = state.profileForm.errors && state.profileForm.errors[field];
    return message ? `<span class="field-error" id="profile-${field}-error">${escapeHtml(message)}</span>` : "";
  }

  function renderCreateUserForm() {
    const form = state.newUserForm;
    const isAdminUser = form.role === "admin";
    return `
      <form class="form-grid compact-form" data-new-user-form novalidate>
        <label class="field">
          <span class="label">Display name</span>
          <input class="input" name="displayName" data-user-field="displayName" value="${escapeAttr(form.displayName)}" placeholder="Player name" maxlength="120"${newUserFieldAttrs("displayName")}>
          ${newUserFieldError("displayName")}
        </label>
        <label class="field">
          <span class="label">Username</span>
          <input class="input" name="username" data-user-field="username" value="${escapeAttr(form.username)}" placeholder="username" autocomplete="username" required${newUserFieldAttrs("username")}>
          ${newUserFieldError("username")}
        </label>
        ${
          isAdminUser
            ? `<label class="field">
                <span class="label">Admin password</span>
                <input class="input" type="password" name="password" data-user-field="password" value="${escapeAttr(form.password)}" placeholder="At least 6 characters" autocomplete="new-password" required${newUserFieldAttrs("password", "new-user-password-help")}>
                <span class="field-help" id="new-user-password-help">At least 6 characters</span>
                ${newUserFieldError("password")}
              </label>`
            : `<div class="field helper-card">
                <span class="label">Player password</span>
                <strong>Not required</strong>
                <span>Players sign in with username only.</span>
              </div>`
        }
        <fieldset class="field choice-group">
          <legend class="label">Role</legend>
          <div class="segmented">
            <label class="segment ${form.role === "player" ? "active" : ""}">
              <input type="radio" name="new-user-role" value="player" data-user-role${form.role === "player" ? " checked" : ""}>
              Player
            </label>
            <label class="segment ${form.role === "admin" ? "active" : ""}">
              <input type="radio" name="new-user-role" value="admin" data-user-role${form.role === "admin" ? " checked" : ""}>
              Admin
            </label>
          </div>
        </fieldset>
        ${form.failure ? `<div class="form-failure full-width" id="new-user-failure" role="alert">${escapeHtml(form.failure)}</div>` : ""}
        ${form.success ? `<div class="form-success full-width" id="new-user-success" role="status" aria-live="polite">${escapeHtml(form.success)}</div>` : ""}
        <div class="row-actions full-width">
          <button class="button primary" type="submit"${form.pending ? ' disabled aria-busy="true"' : ""}>${form.pending ? "Adding user…" : "Add User"}</button>
        </div>
      </form>
    `;
  }

  function newUserFieldAttrs(field, helpId) {
    const hasError = Boolean(state.newUserForm.errors && state.newUserForm.errors[field]);
    const errorId = `new-user-${field}-error`;
    const describedBy = [helpId, hasError ? errorId : ""].filter(Boolean).join(" ");
    const ariaDesc = describedBy ? ` aria-describedby="${describedBy}"` : "";
    const ariaInv = hasError ? ' aria-invalid="true"' : "";
    return `${ariaInv}${ariaDesc}`;
  }

  function newUserFieldError(field) {
    const message = state.newUserForm.errors && state.newUserForm.errors[field];
    return message ? `<span class="field-error" id="new-user-${field}-error">${escapeHtml(message)}</span>` : "";
  }

  function tournamentFieldAttrs(field, helpId) {
    const hasError = Boolean(state.tournamentForm.errors && state.tournamentForm.errors[field]);
    const errorId = `tournament-${field}-error`;
    const describedBy = [helpId, hasError ? errorId : ""].filter(Boolean).join(" ");
    const ariaDesc = describedBy ? ` aria-describedby="${describedBy}"` : "";
    const ariaInv = hasError ? ' aria-invalid="true"' : "";
    return `${ariaInv}${ariaDesc}`;
  }

  function tournamentFieldError(field) {
    const message = state.tournamentForm.errors && state.tournamentForm.errors[field];
    return message ? `<span class="field-error" id="tournament-${field}-error">${escapeHtml(message)}</span>` : "";
  }

  // Suggests existing Players by name as staff type, so a typo doesn't create a duplicate Player that
  // later needs a Merge (ticket 03). The datalist is the browser's own suggestion list: it works with
  // the keyboard and at any width with no extra markup. Picking a suggestion, or typing a new name and
  // pressing Add, appends the exact name to the roster; saving the Tournament links or creates its Player.
  function renderRosterQuickAdd() {
    const players = state.players || [];
    return `
      <section class="tournament-player-create">
        <div>
          <h3>Add a player to the roster</h3>
          <p class="field-help">Start typing to find an existing Player, or add a new name.</p>
        </div>
        <div class="form-grid compact-form">
          <label class="field full">
            <span class="label">Player name</span>
            <input class="input" name="rosterQuickAdd" data-roster-quick-add list="roster-existing-players" value="${escapeAttr(state.rosterQuickAddName)}" placeholder="Type a player's name" autocomplete="off">
          </label>
        </div>
        <datalist id="roster-existing-players">
          ${players.map((player) => `<option value="${escapeAttr(player.name)}"></option>`).join("")}
        </datalist>
        <div class="row-actions">
          <button class="button ghost" type="button" data-action="add-roster-player">Add to roster</button>
        </div>
      </section>
    `;
  }

  function renderTournamentPlayerCreator() {
    const form = state.tournamentPlayerForm;
    return `
      <section class="tournament-player-create">
        <div>
          <h3>Create player account</h3>
          <p class="field-help">Creates a Player login with no password and adds the player to Registered players automatically.</p>
        </div>
        <div class="form-grid compact-form">
          <label class="field">
            <span class="label">Player name</span>
            <input class="input" name="displayName" data-tournament-player-field="displayName" value="${escapeAttr(form.displayName)}" placeholder="Player display name">
          </label>
          <label class="field">
            <span class="label">Username</span>
            <input class="input" name="username" data-tournament-player-field="username" value="${escapeAttr(form.username)}" placeholder="unique username">
          </label>
        </div>
        <div class="row-actions">
          <button class="button ghost" data-action="create-tournament-player">Create and Add Player</button>
        </div>
      </section>
    `;
  }

  function renderRosteredPlayers(players) {
    if (!isStaff() || !players || players.length === 0) {
      return "";
    }
    const playerMap = new Map((state.players || []).map((p) => [normalizePlayerNameKey(p.name), p]));
    return `
      <section class="rostered-players-card" data-rostered-players>
        <div class="workspace-section-head">
          <div>
            <p class="eyebrow">Roster & Skills</p>
            <h3>Rostered Players (${players.length})</h3>
          </div>
        </div>
        <ul class="rostered-players-list">
          ${players.map((name) => {
            const record = playerMap.get(normalizePlayerNameKey(name));
            const skillLevel = record && record.skillLevel ? record.skillLevel : null;
            const skillLabel = formatSkillLevel(skillLevel);
            return `
              <li class="rostered-player-item" data-rostered-player="${escapeAttr(name)}">
                <span class="rostered-player-name">${escapeHtml(name)}</span>
                <span class="skill-badge skill-${escapeAttr(skillLevel || "unrated")}">${escapeHtml(skillLabel)}</span>
              </li>
            `;
          }).join("")}
        </ul>
      </section>
    `;
  }

  function renderUsersTable(users) {
    return `
      <div class="leaderboard-table-wrap users-table-wrap">
        <table class="leaderboard-table users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(renderUserRow).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderUserRow(user) {
    const isProtectedSuperAdmin = user.role === "super_admin";
    const initial = String(user.displayName || user.username || "P").trim().charAt(0).toUpperCase();
    return `
      <tr>
        <td data-label="Name"><span class="people-user"><span class="people-user-avatar" aria-hidden="true">${escapeHtml(initial)}</span><strong>${escapeHtml(user.displayName)}</strong></span></td>
        <td data-label="Username"><span class="people-username">@${escapeHtml(user.username)}</span></td>
        <td data-label="Role"><span class="role-badge ${escapeAttr(user.role)}">${escapeHtml(roleLabel(user.role))}</span></td>
        <td data-label="Status"><span class="people-status ${user.isActive ? "is-active" : "is-inactive"}"><span aria-hidden="true"></span>${user.isActive ? "Active" : "Inactive"}</span></td>
        <td data-label="Actions">
          <div class="user-row-actions">
            <button class="table-action activate" data-action="toggle-user-active" data-value="${escapeAttr(user.id)}" aria-label="Activate ${escapeAttr(user.displayName)}" ${isProtectedSuperAdmin || user.isActive ? "disabled" : ""}>Activate</button>
            <button class="table-action deactivate" data-action="toggle-user-active" data-value="${escapeAttr(user.id)}" aria-label="Deactivate ${escapeAttr(user.displayName)}" ${isProtectedSuperAdmin || !user.isActive ? "disabled" : ""}>Deactivate</button>
            <button class="table-action delete" data-action="delete-user" data-value="${escapeAttr(user.id)}" aria-label="Delete ${escapeAttr(user.displayName)}" ${isProtectedSuperAdmin ? "disabled" : ""}>Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  function renderCompactGame(game) {
    const winner = game.winner ? teamName(game, game.winner) : "No winner";
    return `
      <article class="compact-row">
        <div>
          <strong>${escapeHtml(gameTitle(game))}</strong>
          <span>${escapeHtml(formatDateTime(game.endedAt || game.createdAt))} - ${escapeHtml(capitalize(game.type))}</span>
        </div>
        <button class="winner-badge" data-action="history-summary" data-value="${escapeAttr(game.id)}"><span>${escapeHtml(finalScore(game))} - ${escapeHtml(winner)}</span></button>
      </article>
    `;
  }

  function renderCompactMatch(match) {
    const label = match.status === "completed" ? `${match.scoreA} - ${match.scoreB}` : match.status === "in_progress" ? "Ongoing" : `Court ${match.court}`;
    return `
      <article class="compact-row">
        <div>
          <strong>${escapeHtml(match.teamA.join(" / "))}</strong>
          <span>vs ${escapeHtml(match.teamB.join(" / "))} - Round ${match.round}</span>
        </div>
        <span class="winner-badge">${escapeHtml(label)}</span>
      </article>
    `;
  }

  function renderHome() {
    const completedCount = state.history.length;
    const doublesCount = state.history.filter((game) => game.type === "doubles").length;
    const activeGame = state.currentGame && state.currentGame.status === "active" ? state.currentGame : null;
    const lastGame = state.history[0];

    return `
      <section class="section hero-panel">
        <div class="hero-copy">
          <p class="eyebrow">Side-out scoring assistant</p>
          <h1>PaddlePointer</h1>
          <p>Track singles or doubles matches with the correct serving team, doubles server number, partner positions, side-outs, undo, match summaries, and local match history.</p>
          <div class="hero-actions">
            <button class="button primary" data-action="${activeGame ? "resume-game" : "view"}" data-value="setup">
              ${activeGame ? "Resume Match" : "New Match"}
            </button>
            <button class="button ghost" data-action="view" data-value="history">Match History</button>
            <button class="button ghost" data-action="view" data-value="tournament">Tournament</button>
            <button class="button ghost" data-action="view" data-value="rules">Rules Guide</button>
          </div>
          <div class="hero-stats" aria-label="Saved match stats">
            <div class="stat"><strong>${completedCount}</strong><span>Saved matches</span></div>
            <div class="stat"><strong>${doublesCount}</strong><span>Doubles matches</span></div>
            <div class="stat"><strong>${activeGame ? "Live" : "Ready"}</strong><span>Current state</span></div>
          </div>
        </div>
        <div class="hero-court" aria-hidden="true">
          <div class="hero-court-card">
            <div class="mini-score-row">
              <span>${escapeHtml(activeGame ? activeGame.teamA.name : "Team A")}</span>
              <strong>${activeGame ? activeGame.teamA.score : "0"}</strong>
            </div>
            <div class="mini-score-row">
              <span><span class="score-call-chip">${escapeHtml(activeGame ? scoreCall(activeGame) : "0 - 0 - 2")}</span></span>
              <strong>VS</strong>
            </div>
            <div class="mini-score-row">
              <span>${escapeHtml(activeGame ? activeGame.teamB.name : "Team B")}</span>
              <strong>${activeGame ? activeGame.teamB.score : "0"}</strong>
            </div>
          </div>
        </div>
      </section>
      <section class="dashboard-grid" aria-label="Quick actions">
        <div class="panel">
          <h2>Quick Match</h2>
          <p>Use doubles, first server Team A, target 11, win by 2.</p>
          <button class="button dark" data-action="start-default">Start Default</button>
        </div>
        <div class="panel">
          <h2>Last Result</h2>
          ${
            lastGame
              ? `<p>${escapeHtml(gameTitle(lastGame))}<br><strong>${escapeHtml(finalScore(lastGame))}</strong></p>
                 <button class="button ghost" data-action="history-summary" data-value="${escapeHtml(lastGame.id)}">Open Summary</button>`
              : `<p>No completed matches yet. Finished matches appear here automatically.</p>
                 <button class="button ghost" data-action="view" data-value="setup">New Match</button>`
          }
        </div>
        <div class="panel">
          <h2>Tournament</h2>
          <p>Register players, choose courts, generate random doubles matches, and rank players only.</p>
          <button class="button green" data-action="view" data-value="tournament">Build Tournament</button>
        </div>
        <div class="panel">
          <h2>Score Call</h2>
          <p>Doubles uses server score - receiver score - server number. The first service starts at 0 - 0 - 2.</p>
          <div class="row-actions">
            <button class="button ghost" data-action="view" data-value="leaderboard">Leaderboard</button>
            <button class="button ghost" data-action="view" data-value="rules">Review Rules</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderSetup() {
    const setup = state.setup;
    const isDoubles = setup.type === "doubles";

    return `
      <section class="page-title">
        <div>
          <h1>New Match</h1>
          <p>${isVisitor() ? "Add full player names before starting so the visitor leaderboard can rank everyone clearly." : "Choose singles or doubles, name the teams, pick the first server, and set the target score."}</p>
        </div>
        ${state.currentGame && state.currentGame.status === "active" ? '<button class="button green" data-action="resume-game">Resume Match</button>' : ""}
      </section>
      <section class="setup-layout">
        <div class="panel setup-form">
          <section class="setup-group" aria-labelledby="setup-players-title">
            <h2 id="setup-players-title">Players</h2>
            <div class="form-grid">
              <fieldset class="field full choice-group">
                <legend class="label">Match type</legend>
                <div class="segmented">
                  ${renderSetupChoices("type", [["singles", "Singles"], ["doubles", "Doubles"]], setup.type)}
                </div>
              </fieldset>
              ${renderPlayerFields(isDoubles)}
            </div>
          </section>
          <section class="setup-group" aria-labelledby="setup-rules-title">
            <h2 id="setup-rules-title">Rules</h2>
            <div class="form-grid">
              <fieldset class="field full choice-group">
                <legend class="label">First server</legend>
                <div class="segmented">
                  ${renderSetupChoices(
                    "firstServer",
                    [
                      ["A", '<span data-first-server-name="A">Team A</span>'],
                      ["B", '<span data-first-server-name="B">Team B</span>'],
                    ],
                    setup.firstServer
                  )}
                </div>
              </fieldset>
              ${isDoubles ? ["A", "B"].map((key) => `
              <fieldset class="field full choice-group">
                <legend class="label">Team ${key} starts on the right</legend>
                <div class="segmented">
                  ${renderSetupChoices(
                    `team${key}Right`,
                    [0, 1].map((index) => [index, escapeHtml(setupPlayerLabel(key, index))]),
                    setup[`team${key}Right`]
                  )}
                </div>
              </fieldset>`).join("") : ""}
              <fieldset class="field full choice-group">
                <legend class="label">Match target</legend>
                <div class="segmented three">
                  ${renderSetupChoices("targetScore", [11, 15, 21].map((target) => [target, target]), setup.targetScore)}
                </div>
              </fieldset>
              <div class="field full">
                <div class="toggle-row">
                  <div class="toggle-copy">
                    <strong id="win-by-two-label">Win by 2</strong>
                    <span id="win-by-two-hint">${setup.winByTwo ? "Winner must lead by at least 2 points." : "First team to the target wins."}</span>
                  </div>
                  <button class="switch ${setup.winByTwo ? "on" : ""}" type="button" role="switch" aria-checked="${setup.winByTwo ? "true" : "false"}" aria-labelledby="win-by-two-label" aria-describedby="win-by-two-hint" data-action="toggle-win-by-two"></button>
                </div>
              </div>
            </div>
          </section>
          <section class="setup-group" aria-labelledby="setup-scorer-title">
            <h2 id="setup-scorer-title">Scorer</h2>
            <label class="field">
              <span class="label">Scorer / device name</span>
              <input class="input" name="scorerName" data-field="scorerName" value="${escapeAttr(setup.scorerName)}" maxlength="48" placeholder="Court 1, Front Desk, Coach AC">
            </label>
          </section>
        </div>
        <aside class="preview-card" aria-label="Setup preview">
          <div class="court-preview">
            <div class="court-lines"></div>
            <div class="preview-score">
              ${["A", "B"]
                .map(
                  (key) => `<div class="${setup.firstServer === key ? "is-serving" : ""}"><strong>0</strong><span data-preview-team="${key}">${escapeHtml(setupTeamLabel(key))}</span>${setup.firstServer === key ? '<small class="preview-serve">Serves first</small>' : ""}</div>`
                )
                .join(`<span class="score-call-chip">${isDoubles ? "0 - 0 - 2" : "0 - 0"}</span>`)}
            </div>
          </div>
          <div class="preview-meta">
            <h3>Match format</h3>
            <ul class="meta-list">
              <li><span>Mode</span><strong>${capitalize(setup.type)}</strong></li>
              <li><span>Scored by</span><strong>${escapeHtml(cleanName(setup.scorerName, "Court 1"))}</strong></li>
              <li><span>First server</span><strong>${escapeHtml(teamNameFromSetup(setup.firstServer))}</strong></li>
              <li><span>Target</span><strong>${setup.targetScore}</strong></li>
              <li><span>Win rule</span><strong>${setup.winByTwo ? "Win by 2" : "Target only"}</strong></li>
              <li><span>Scoring</span><strong>Side-out</strong></li>
            </ul>
          </div>
          <div class="preview-actions">
            <button class="button primary" data-action="start-game">Start Match</button>
            <button class="button ghost" data-action="view" data-value="home">Back Home</button>
          </div>
        </aside>
      </section>
    `;
  }

  // One native radio per option: a single checked option per group, arrow keys move the choice, Tab enters the group once.
  function renderSetupChoices(field, options, selected) {
    return options
      .map(([value, label]) => {
        const checked = String(selected) === String(value);
        return `
          <label class="segment ${checked ? "active" : ""}">
            <input type="radio" name="setup-${field}" value="${value}" data-setup-choice="${field}"${checked ? " checked" : ""}>
            ${label}
          </label>
        `;
      })
      .join("");
  }

  function setupFieldAttrs(field) {
    const hasError = Boolean(state.setupErrors && state.setupErrors[field]);
    if (!hasError) return "";
    return ` aria-invalid="true" aria-describedby="setup-${field}-error"`;
  }

  function setupFieldError(field) {
    const message = state.setupErrors && state.setupErrors[field];
    return message ? `<span class="field-error" id="setup-${field}-error" role="alert">${escapeHtml(message)}</span>` : "";
  }

  function renderPlayerFields(isDoubles) {
    const setup = state.setup;
    if (!isDoubles) {
      return `
        <label class="field">
          <span class="label">Team A</span>
          <input class="input" name="teamAPlayer1" data-field="teamAPlayer1" value="${escapeAttr(setup.teamAPlayer1)}" maxlength="32" placeholder="Player 1"${setupFieldAttrs("teamAPlayer1")}>
          ${setupFieldError("teamAPlayer1")}
        </label>
        <label class="field">
          <span class="label">Team B</span>
          <input class="input" name="teamBPlayer1" data-field="teamBPlayer1" value="${escapeAttr(setup.teamBPlayer1)}" maxlength="32" placeholder="Player 2"${setupFieldAttrs("teamBPlayer1")}>
          ${setupFieldError("teamBPlayer1")}
        </label>
      `;
    }

    return `
      <fieldset class="team-input-group">
        <legend>Team A</legend>
        <div class="team-input-grid">
          <label class="field">
            <span class="label">Player 1</span>
            <input class="input" name="teamAPlayer1" data-field="teamAPlayer1" value="${escapeAttr(setup.teamAPlayer1)}" maxlength="32" placeholder="A - Player 1"${setupFieldAttrs("teamAPlayer1")}>
            ${setupFieldError("teamAPlayer1")}
          </label>
          <label class="field">
            <span class="label">Player 2</span>
            <input class="input" name="teamAPlayer2" data-field="teamAPlayer2" value="${escapeAttr(setup.teamAPlayer2)}" maxlength="32" placeholder="A - Player 2"${setupFieldAttrs("teamAPlayer2")}>
            ${setupFieldError("teamAPlayer2")}
          </label>
        </div>
      </fieldset>
      <fieldset class="team-input-group">
        <legend>Team B</legend>
        <div class="team-input-grid">
          <label class="field">
            <span class="label">Player 1</span>
            <input class="input" name="teamBPlayer1" data-field="teamBPlayer1" value="${escapeAttr(setup.teamBPlayer1)}" maxlength="32" placeholder="B - Player 1"${setupFieldAttrs("teamBPlayer1")}>
            ${setupFieldError("teamBPlayer1")}
          </label>
          <label class="field">
            <span class="label">Player 2</span>
            <input class="input" name="teamBPlayer2" data-field="teamBPlayer2" value="${escapeAttr(setup.teamBPlayer2)}" maxlength="32" placeholder="B - Player 2"${setupFieldAttrs("teamBPlayer2")}>
            ${setupFieldError("teamBPlayer2")}
          </label>
        </div>
      </fieldset>
    `;
  }

  function renderScoreboard() {
    const game = state.currentGame;
    if (!game || game.status !== "active") {
      return `
        <section class="empty-state">
          <h2>No active match</h2>
          <p>Start a singles or doubles match to open the Scoreboard.</p>
          <div class="row-actions"><button class="button primary" data-action="view" data-value="setup">New Match</button></div>
        </section>
      `;
    }

    const tournamentNote = game.tournamentMatch
      ? `Tournament match - Round ${game.tournamentMatch.round}, Court ${game.tournamentMatch.court}. Finishing this match will lock its scheduled slot and update the player leaderboard.`
      : `${capitalize(game.type)} to ${game.targetScore}${game.winByTwo ? ", win by 2" : ""}. Tap the rally winner and the app handles serving, side-outs, and points.`;

    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">Live scoreboard</p>
          <h1>${escapeHtml(gameTitle(game))}</h1>
          <p>${escapeHtml(tournamentNote)}</p>
        </div>
      </section>
      <section class="scoreboard">
        ${renderTeamTile(game, "A")}
        ${renderCourtBoard(game)}
        ${renderTeamTile(game, "B")}
      </section>
    `;
  }

  function renderTeamTile(game, key) {
    const team = game[key === "A" ? "teamA" : "teamB"];
    const isServing = game.servingTeam === key;
    const isDoubles = game.type === "doubles";
    const currentServer = currentServerName(game);
    const activePlayers = team.players.filter(Boolean);
    // The badge marks the serving Team; in doubles the current server is also tagged by name.
    const players = activePlayers.length
      ? activePlayers
          .map((p) =>
            isServing && isDoubles && p === currentServer
              ? `<span class="serving-player">${escapeHtml(p)} <span class="serving-tag">Server</span></span>`
              : escapeHtml(p)
          )
          .join(" / ")
      : "&nbsp;";

    return `
      <article class="score-tile ${isServing ? "serving" : ""}">
        <div class="team-head">
          <h2>${escapeHtml(team.name)}</h2>
          ${
            isServing
              ? '<span class="team-head-status"><img class="score-serve-icon" src="assets/pickleball-icon.png" alt="" aria-hidden="true"><span class="serve-badge">Serving</span></span>'
              : ""
          }
        </div>
        <div class="score-number" data-score-key="scoreboard:${escapeAttr(game.id)}:${key}" aria-label="${escapeAttr(team.name)} score">${team.score}</div>
        <div class="team-meta">
          <div class="player-line">${players}</div>
          ${
            timeoutsLeft(game, key)
              ? `<button class="button ghost timeout-btn" data-action="timeout" data-value="${key}">Timeout · ${timeoutsLeft(game, key)} left</button>`
              : `<button class="button ghost timeout-btn" data-action="timeout" data-value="${key}" disabled>No timeouts left</button>`
          }
        </div>
        <button class="rally-btn ${key === "B" ? "alt" : ""}" data-action="rally" data-value="${key}">
          <img class="rally-icon" src="assets/tap-icon.png" alt="" aria-hidden="true">
          <span class="rally-full-text">${escapeHtml(team.name)} wins rally</span>
          <span class="rally-short-text">Wins rally</span>
        </button>
      </article>
    `;
  }

  function renderCourtBoard(game) {
    ensureDoublesTracking(game);
    const isDoubles = game.type === "doubles";
    const receivingName = teamName(game, otherTeam(game.servingTeam));
    const lastEvent = game.events[game.events.length - 1];
    const actionLabel = lastEvent ? actionText(lastEvent, game) : "Opening serve";
    const serve = servePosition(game);

    return `
      <aside class="court-board" aria-label="Serving details">
        <div class="callout">
          <span class="label-small">Current score call</span>
          <span class="call">${escapeHtml(scoreCall(game))}</span>
          ${isSwitchEndsRally(game) ? '<span class="status-pill scheduled" role="status">Switch ends</span>' : ""}
        </div>
        <div class="serve-from-card">
          <span class="label-small">Serve position</span>
          <strong>${serve.label} court</strong>
          ${isDoubles ? "<small>Partners switch only after points; a first fault passes to the partner where they stand.</small>" : ""}
        </div>
        <div class="live-court">
          ${renderCourtSide(game, "A", serve)}
          ${renderCourtSide(game, "B", serve)}
        </div>
        <div class="board-meta">
          <div class="board-meta-row"><span>Receiving team</span><strong>${escapeHtml(receivingName)}</strong></div>
          ${isDoubles ? `<div class="board-meta-row"><span>Server</span><strong>${game.serverNumber}</strong></div>` : ""}
          <div class="board-meta-row"><span>Last rally</span><strong>${escapeHtml(actionLabel)}</strong></div>
          <div class="board-meta-row"><span>Side-outs</span><strong>${game.sideOuts}</strong></div>
          <div class="score-controls">
            ${isDoubles ? '<button class="button ghost" data-action="correct-serve">Correct Serve</button>' : ""}
            <button class="button ghost" data-action="undo" ${canUndo(game) ? "" : "disabled"}>Undo</button>
            <button class="button warn" data-action="end-early">End Match</button>
            <button class="button ghost quiet-danger" data-action="reset-active">Reset</button>
          </div>
        </div>
      </aside>
    `;
  }

  function renderCourtSide(game, key, serve) {
    const isServing = game.servingTeam === key;
    const isDoubles = game.type === "doubles";
    const zones =
      key === "A"
        ? [
            { side: "left", label: "Left" },
            { side: "right", label: "Right" },
          ]
        : [
            { side: "right", label: "Right" },
            { side: "left", label: "Left" },
          ];

    return `
      <div class="court-team court-team-${key.toLowerCase()} ${isServing ? "serving" : "receiving"}">
        <div class="court-team-label">
          <strong>${escapeHtml(teamName(game, key))}</strong>
          <span>${isServing ? "Serving" : "Receiving"}</span>
        </div>
        ${zones
          .map((zone) => {
            const active = isServing && serve.side === zone.side;
            const playerName = isDoubles ? playerNameAtSide(game, key, zone.side) : teamName(game, key);
            const paddleIcon = active ? "paddle-serving.png" : "paddle-inactive.png";
            const paddleLetter = zone.label.slice(0, 1);
            return `
              <div class="court-service-zone ${isServing ? "server-zone" : "receiver-zone"} ${active ? "active" : ""}">
                ${
                  isServing
                    ? `<div class="court-paddle-marker ${active ? "is-serving" : "is-inactive"}" aria-hidden="true"><img src="assets/${paddleIcon}" alt=""><b>${escapeHtml(paddleLetter)}</b></div><span>${zone.label}</span> <em>${escapeHtml(playerName)}</em>${active ? " <small>Serve here</small>" : ""}`
                    : isDoubles
                      ? `<em>${escapeHtml(playerName)}</em>`
                    : ""
                }
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderSummary() {
    const game = state.summaryGame;
    if (!game) {
      return `
        <section class="empty-state">
          <h2>No summary selected</h2>
          <p>Completed matches and opened history items show their match summary here.</p>
          <div class="row-actions"><button class="button primary" data-action="view" data-value="history">Match History</button></div>
        </section>
      `;
    }

    const winnerName = game.winner ? teamName(game, game.winner) : "No winner";
    const events = Array.isArray(game.events) ? game.events : null;
    const timeline = events === null
      ? '<div class="empty-state"><h2>Loading rallies...</h2><p>Fetching full match log.</p></div>'
      : events.length
        ? events
            .map(
              (event, index) => `
              <div class="timeline-event">
                <div class="event-number">${index + 1}</div>
                <div class="event-main">
                  <strong>${event.action === "correction" ? "Serve corrected" : event.action === "timeout" ? "Timeout" : `${escapeHtml(teamName(game, event.rallyWinner))} won the rally`}</strong>
                  <span>${escapeHtml(actionText(event, game))}</span>
                </div>
                <div class="event-call">${escapeHtml(event.newScore)}</div>
              </div>
            `
            )
            .join("")
        : '<div class="empty-state"><h2>No rallies recorded</h2><p>This match was ended before any rally was tracked.</p></div>';

    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">Match summary</p>
          <h1>${escapeHtml(gameTitle(game))}</h1>
          <p>${escapeHtml(formatDateTime(game.endedAt || game.createdAt))}</p>
        </div>
      </section>
      <section class="summary-layout">
        <article class="result-card">
          <p class="eyebrow">${game.endedEarly ? "Ended early" : "Final result"}</p>
          <h2>${escapeHtml(winnerName)}</h2>
          <div class="final-score">
            <div><strong>${escapeHtml(game.teamA.score)}</strong><span>${escapeHtml(game.teamA.name)}</span></div>
            <span>VS</span>
            <div><strong>${escapeHtml(game.teamB.score)}</strong><span>${escapeHtml(game.teamB.name)}</span></div>
          </div>
          <ul class="meta-list">
            <li><span>Mode</span><strong>${escapeHtml(capitalize(game.type))}</strong></li>
            <li><span>Scored by</span><strong>${escapeHtml(game.scorerName || "Unknown")}</strong></li>
            <li><span>Duration</span><strong>${escapeHtml(formatDuration(game.startedAt, game.endedAt))}</strong></li>
            ${game.endedEarly && game.retiredTeam ? `<li><span>Outcome</span><strong>${escapeHtml(teamName(game, game.retiredTeam))} retired or forfeited</strong></li>` : ""}
            <li><span>Total side-outs</span><strong>${escapeHtml(game.sideOuts)}</strong></li>
            <li><span>Rallies tracked</span><strong>${events !== null ? events.filter(rallyEngine.isRally).length : "..."}</strong></li>
            <li><span>Timeouts used</span><strong>${escapeHtml(`${teamName(game, "A")} ${(game.timeoutsUsed && game.timeoutsUsed.A) || 0}, ${teamName(game, "B")} ${(game.timeoutsUsed && game.timeoutsUsed.B) || 0}`)}</strong></li>
          </ul>
          <div class="row-actions">
            ${
              isStaff()
                ? `${game.tournamentMatch ? '<button class="button ghost" data-action="view" data-value="tournament">Tournament</button>' : ""}
                   <button class="button ghost" data-action="view" data-value="history">History</button>
                   ${isSuperAdmin() ? '<button class="button ghost" data-action="view" data-value="setup">New Match</button>' : ""}`
                : isVisitor()
                  ? '<button class="button ghost" data-action="view" data-value="history">History</button><button class="button ghost" data-action="view" data-value="setup">New Match</button>'
                  : '<button class="button ghost" data-action="view" data-value="home">My Page</button>'
            }
          </div>
        </article>
        <article class="panel">
          <h2>Score timeline</h2>
          <p>Every rally is listed with the action that followed and the resulting score call.</p>
          <div class="timeline">${timeline}</div>
        </article>
      </section>
    `;
  }

  function renderHistory() {
    const games = visibleHistory();

    return `
      <section class="page-title">
        <div>
          <h1>${isVisitor() || isStaff() ? "Match History" : "My Matches"}</h1>
          <p>${escapeHtml(historyStatusText(games))}${state.lastFetched.history ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.history, state.refreshingHistory)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <button class="button ghost" data-action="refresh-history"${state.refreshingHistory ? ' disabled aria-busy="true"' : ""}>${state.refreshingHistory ? "Refreshing…" : "Refresh"}</button>
          ${isStaff() && games.length ? '<button class="button ghost quiet-danger" data-action="clear-history">Clear Local Cache</button>' : ""}
        </div>
      </section>
      ${renderRefreshErrorBanner(state.historyRefreshError, "refresh-history")}
      ${
        games.length
          ? `<section class="history-list ${state.refreshingHistory ? "is-updating" : ""}" ${state.refreshingHistory ? 'aria-busy="true"' : ""}>
              ${state.refreshingHistory ? '<div class="data-updating-indicator" role="status"><span class="data-updating-badge">Updating history…</span></div>' : ""}
              ${historyDays(games)
                .map(
                  ({ label, games: dayGames }) => `
                    <h2 class="history-day">${escapeHtml(label)} <span>${dayGames.length} match${dayGames.length === 1 ? "" : "es"}</span></h2>
                    ${dayGames.map(renderHistoryItem).join("")}
                  `
                )
                .join("")}
            </section>`
          : `<section class="empty-state">
              <h2>No saved matches yet</h2>
              <p>Finish a match on the Scoreboard and it will appear here with winner, score, date, match type, and scorer name.</p>
              ${canUseStandaloneSetup() ? '<div class="row-actions"><button class="button primary" data-action="view" data-value="setup">New Match</button></div>' : ""}
            </section>`
      }
    `;
  }

  // Consecutive games that ended on the same local day, labelled Today, Yesterday, or the date.
  function historyDays(games) {
    const days = [];
    games.forEach((game) => {
      const label = historyDayLabel(game.endedAt || game.createdAt);
      if (!days.length || days[days.length - 1].label !== label) days.push({ label, games: [] });
      days[days.length - 1].games.push(game);
    });
    return days;
  }

  function historyDayLabel(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Unknown date";
    const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysAgo = Math.round((dayStart(new Date()) - dayStart(date)) / 86400000);
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date);
  }

  function renderHistoryItem(game) {
    const winner = game.winner ? teamName(game, game.winner) : "No winner";
    const earlyEndNote = game.endedEarly && game.retiredTeam
      ? `${teamName(game, game.retiredTeam)} retired or forfeited.`
      : "";
    const gameSummaryLabel = `${gameTitle(game)}, ${formatDateTime(game.endedAt || game.createdAt)}`;
    const endedAt = new Date(game.endedAt || game.createdAt);
    const time = Number.isNaN(endedAt.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(endedAt);
    return `
      <article class="history-item">
        <div class="history-main">
          <div class="history-teams">
            ${["A", "B"]
              .map((key) => {
                const team = key === "A" ? game.teamA : game.teamB;
                return `<div class="history-side ${game.winner === key ? "is-winner" : ""}"><span class="history-team-name">${escapeHtml(team.name)}</span><span class="history-score">${escapeHtml(team.score)}</span></div>`;
              })
              .join("")}
          </div>
          <p class="history-outcome"><span class="winner-badge">Winner: ${escapeHtml(winner)}</span>${earlyEndNote ? ` <span>${escapeHtml(earlyEndNote)}</span>` : ""}</p>
          <div class="history-meta">
            ${time ? `<span>${escapeHtml(time)}</span>` : ""}
            <span>${escapeHtml(capitalize(game.type))}</span>
            <span>${escapeHtml(game.scorerName || "Unknown scorer")}</span>
            <span>${escapeHtml(formatDuration(game.startedAt, game.endedAt))}</span>
            ${game._shared ? "<span>Shared</span>" : "<span>Local</span>"}
          </div>
        </div>
        <button class="button ghost history-summary-action" data-action="history-summary" data-value="${escapeAttr(game.id)}" aria-label="View summary for ${escapeAttr(gameSummaryLabel)}">View Summary</button>
      </article>
    `;
  }

  function renderLeaderboard() {
    const games = visibleHistory();
    const stats = state.leaderboard || buildLeaderboardStats(games);
    const source = state.historySource === "shared" ? "shared history" : "local cached history";
    const isVisitorBoard = isVisitor();
    const scopeEvent = state.leaderboard && state.leaderboard.event;
    const shownScope = scopeEvent ? "current" : "all";

    return `
      <section class="page-title">
        <div>
          <h1>${isVisitorBoard || isStaff() ? "Leaderboard" : "My match stats"}</h1>
          ${isVisitorBoard ? "" : `<h2 class="leaderboard-scope-heading">${scopeEvent ? `Current Event: ${escapeHtml(scopeEvent.name)}` : "All Events"}</h2>`}
          <p>${isVisitorBoard ? "" : `Rankings use completed matches from ${escapeHtml(source)}${isStaff() ? "" : " filtered to your player account"}. Teams and players are ranked by wins, then win rate, then point differential.`}${state.lastFetched.leaderboard || state.lastFetched.history ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.leaderboard || state.lastFetched.history, state.refreshingLeaderboard)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <button class="button ghost" data-action="refresh-leaderboard"${state.refreshingLeaderboard ? ' disabled aria-busy="true"' : ""}>${state.refreshingLeaderboard ? "Refreshing…" : "Refresh"}</button>
          <button class="button ghost" data-action="view" data-value="history">Match History</button>
        </div>
      </section>
      ${renderRefreshErrorBanner(state.leaderboardRefreshError, "refresh-leaderboard")}
      ${
        isVisitorBoard
          ? ""
          : `<div class="segmented leaderboard-scope" role="group" aria-label="Leaderboard scope">
              ${[["current", "Current Event"], ["all", "All Events"]].map(([value, label]) => `<button class="segment ${shownScope === value ? "active" : ""}" type="button" data-action="leaderboard-scope" data-value="${value}" aria-pressed="${shownScope === value}">${label}</button>`).join("")}
            </div>`
      }
      ${
        stats.gamesCount
          ? `<section class="leaderboard-summary">
              <div class="stat"><strong>${stats.gamesCount}</strong><span>Matches counted</span></div>
              ${isVisitorBoard ? "" : `<div class="stat"><strong>${stats.teamRows.length}</strong><span>Teams ranked</span></div>`}
              <div class="stat"><strong>${stats.playerRows.length}</strong><span>Players ranked</span></div>
            </section>
            ${renderLeaderboardLeaders(stats.playerRows)}
            <section class="leaderboard-grid ${state.refreshingLeaderboard ? "is-updating" : ""}" ${state.refreshingLeaderboard ? 'aria-busy="true"' : ""}>
              ${renderLeaderboardTable(isVisitorBoard ? "Visitor Player Leaderboard" : "Player Leaderboard", stats.playerRows, "player")}
              ${isVisitorBoard ? "" : renderLeaderboardTable("Team Leaderboard", stats.teamRows, "team")}
            </section>`
          : `<section class="empty-state">
              <h2>No leaderboard yet</h2>
              <p>${scopeEvent ? `No finished Matches in ${escapeHtml(scopeEvent.name)} yet. Choose All Events to see every finished Match.` : "Finish at least one match with a winner and the standings will calculate automatically."}</p>
              ${canUseStandaloneSetup() ? '<div class="row-actions"><button class="button primary" data-action="view" data-value="setup">New Match</button></div>' : ""}
            </section>`
      }
    `;
  }

  // The top three players, first place as the one dominant card.
  function renderLeaderboardLeaders(rows) {
    if (!rows.length) return "";
    return `
      <section class="leaderboard-leaders" aria-label="Top players">
        ${rows
          .slice(0, 3)
          .map(
            (row, index) => `
              <article class="leader-card ${index === 0 ? "is-first" : ""}">
                <span class="leader-place">${["1st", "2nd", "3rd"][index]}</span>
                <strong class="leader-name">${escapeHtml(row.name)}</strong>
                <span class="leader-record">${row.wins}-${row.losses} · ${row.winRate}% · ${row.diff >= 0 ? "+" : ""}${row.diff}</span>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderLeaderboardTable(title, rows, type) {
    const identity = type === "team" ? "Team" : "Player";
    const scrollHintId = `leaderboard-${type}-scroll-hint`;
    return `
      <article class="leaderboard-card">
        <div class="leaderboard-card-head">
          <h2>${title}</h2>
          <span>${rows.length} ${identity.toLowerCase()}${rows.length === 1 ? "" : "s"}</span>
        </div>
        ${
          rows.length
            ? `<p class="leaderboard-scroll-hint" id="${scrollHintId}">Swipe left or right to review wins, losses, percentage, differential, and minutes.</p>
              <div class="leaderboard-table-wrap" tabindex="0" role="region" aria-label="${escapeAttr(title)} statistics" aria-describedby="${scrollHintId}">
                <table class="leaderboard-table">
                  <thead>
                    <tr>
                      <th id="${type}-rank" scope="col">Rank</th>
                      <th id="${type}-identity" scope="col">${identity}</th>
                      <th id="${type}-wins" scope="col">W</th>
                      <th id="${type}-losses" scope="col">L</th>
                      <th id="${type}-win-rate" scope="col">Win %</th>
                      <th id="${type}-differential" scope="col">Diff</th>
                      <th id="${type}-minutes" scope="col">Minutes Played</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map((row, index) => renderLeaderboardRow(row, index, type)).join("")}
                  </tbody>
                </table>
              </div>`
            : `<p class="leaderboard-empty">No ${type} results yet.</p>`
        }
      </article>
    `;
  }

  function renderLeaderboardRow(row, index, type) {
    const sign = row.diff >= 0 ? "+" : "";
    const differentialLabel = row.diff >= 0 ? "Positive differential" : "Negative differential";
    return `
      <tr>
        <td class="leaderboard-rank" headers="${type}-rank"><span class="rank-badge" aria-label="Rank ${index + 1}">${index + 1}</span></td>
        <th scope="row" class="leaderboard-identity" headers="${type}-identity">
          <strong>${escapeHtml(row.name)}</strong>
          ${row.detail ? `<small>${escapeHtml(row.detail)}</small>` : ""}
        </th>
        <td headers="${type}-wins">${row.wins}</td>
        <td headers="${type}-losses">${row.losses}</td>
        <td headers="${type}-win-rate">${row.winRate}%</td>
        <td class="${row.diff >= 0 ? "positive" : "negative"}" headers="${type}-differential"><span class="sr-only">${differentialLabel}: </span>${sign}${row.diff}</td>
        <td headers="${type}-minutes">${row.minutesPlayed || 0}</td>
      </tr>
    `;
  }

  function renderLiveView() {
    const activeTab = state.liveTab === "next" ? "next" : "ongoing";
    const liveBoard = liveBoardData();
    state.liveTab = activeTab;
    const courtSlots = activeTab === "next" ? liveBoard.nextSlots : liveBoard.ongoingSlots;
    const topPlayers = buildTournamentStats(state.tournament).rows.filter((row) => row.games > 0).slice(0, 5);
    const nextMatches = liveBoard.nextMatches;
    const liveCount = courtSlots.filter((match) => match && match.statusType === "live").length;
    const finalCount = courtSlots.filter((match) => match && match.statusType === "completed").length;
    const scheduledCount = courtSlots.filter((match) => match && match.statusType === "scheduled").length;
    const availableCount = courtSlots.filter((match) => match && match.statusType === "available").length;
    const unscheduledCount = courtSlots.filter((match) => match && match.statusType === "unscheduled").length;
    const courtState = state.tournamentRefreshError ? "failed" : state.refreshingTournament ? "loading" : "";
    const scoreCards = courtSlots.map((match, index) => renderLiveScoreCard(match, false, index, courtState)).join("");
    const subheadValue =
      activeTab === "next"
        ? `${scheduledCount} starting soon${unscheduledCount ? ` - ${unscheduledCount} unscheduled court${unscheduledCount === 1 ? "" : "s"}` : ""}`
        : `${liveCount} live now${finalCount ? ` - ${finalCount} final winner${finalCount === 1 ? "" : "s"}` : ""}${availableCount ? ` - ${availableCount} available court${availableCount === 1 ? "" : "s"}` : ""}`;

    return `
      <section class="page-title live-tv-title">
        <div>
          <h1>Live Board</h1>
          <p>Every tournament court at a glance. A finished court keeps its winner up until the next Match starts there.${state.lastFetched.tournament ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.tournament, state.refreshingTournament)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <button class="button ghost" data-action="refresh-tournament"${state.refreshingTournament ? ' disabled aria-busy="true"' : ""}>${state.refreshingTournament ? "Refreshing…" : "Refresh"}</button>
          <button class="button ghost" data-action="view" data-value="tournament">Tournament</button>
        </div>
      </section>

      ${renderRefreshErrorBanner(state.tournamentRefreshError, "refresh-tournament")}

      <section class="live-view-grid">
        <article class="live-score-panel">
          <div class="live-section-head">
            ${renderLiveBoardTabs(activeTab)}
            <span class="live-court-subhead">${escapeHtml(subheadValue)}</span>
          </div>
          <div
            id="live-board-panel"
            class="live-tabpanel"
            role="tabpanel"
            aria-labelledby="live-tab-${activeTab}"
          >
            <div class="live-score-grid count-${courtSlots.length} court-grid ${courtSlots.length > 4 ? "all-courts-grid" : ""} ${activeTab === "next" ? "next-match-grid" : "ongoing-match-grid"} ${state.refreshingTournament ? "is-updating" : ""}" ${state.refreshingTournament ? 'aria-busy="true"' : ""}>
              ${scoreCards}
            </div>
          </div>
        </article>

        <aside class="live-side-panel">
          <article class="leaderboard-card live-top-card">
            <div class="leaderboard-card-head">
              <h2>Top Players</h2>
              <span>Top 5</span>
            </div>
            ${
              topPlayers.length
                ? `<div class="top-player-list">${topPlayers.map(renderTopPlayerRow).join("")}</div>`
                : '<p class="leaderboard-empty">No completed tournament results yet.</p>'
            }
          </article>

          <article class="leaderboard-card live-next-card">
            <div class="leaderboard-card-head">
              <h2>Next Matches</h2>
              <span>${nextMatches.length} queued</span>
            </div>
            ${
              nextMatches.length
                ? `<div class="live-next-list">${nextMatches.map(renderLiveNextMatch).join("")}</div>`
                : '<p class="leaderboard-empty">No scheduled matches waiting.</p>'
            }
          </article>
        </aside>
      </section>
    `;
  }

  function renderLiveBoardTabs(activeTab) {
    const tabs = liveBoardTabsModule ? liveBoardTabsModule.LIVE_BOARD_TABS : ["ongoing", "next"];
    const labels = {
      ongoing: "Ongoing Match",
      next: "Next Match",
    };

    return `
      <div class="live-board-tabs" role="tablist" aria-label="Live board tabs">
        ${tabs
          .map((value) => {
            const props = liveBoardTabsModule
              ? liveBoardTabsModule.getTabProps(value, activeTab)
              : {
                  id: `live-tab-${value}`,
                  role: "tab",
                  isSelected: value === activeTab,
                  ariaSelected: value === activeTab ? "true" : "false",
                  tabIndex: value === activeTab ? 0 : -1,
                  ariaControls: "live-board-panel",
                };
            return `
              <button
                id="${props.id}"
                class="live-board-tab ${props.isSelected ? "active" : ""}"
                type="button"
                data-action="live-tab"
                data-value="${value}"
                role="${props.role}"
                tabindex="${props.tabIndex}"
                aria-selected="${props.ariaSelected}"
                aria-controls="${props.ariaControls}"
              >
                ${escapeHtml(labels[value] || value)}
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderLiveScoreCard(liveMatch, expanded, index, courtState) {
    if (!liveMatch) {
      return `
        <div class="live-score-card court-state failed">
          <div class="live-score-card-head">
            <span class="live-status">Live Match unavailable</span>
          </div>
          <p class="live-court-state-detail">No active Match is available to display.</p>
        </div>
      `;
    }

    const refreshStatus = renderLiveCardRefreshState(courtState);
    const court = liveMatch.court || Number(index || 0) + 1;
    // The court number is the first thing a player looks for, so it leads every card.
    const plate = `<span class="live-court-plate"><small>Court</small><b>${escapeHtml(court)}</b></span>`;
    const head = (extra = "") => `
      <div class="live-score-card-head">
        ${plate}
        <span class="live-status">${escapeHtml(liveMatch.statusText)}</span>
        ${refreshStatus}
        <strong>${liveMatch.round ? `Round ${escapeHtml(liveMatch.round)}` : ""}${extra}</strong>
      </div>
    `;

    if (liveMatch && (liveMatch.statusType === "available" || liveMatch.statusType === "unscheduled")) {
      const statusText = courtState === "failed" ? "Court status unavailable" : courtState === "loading" ? "Updating court status" : liveMatch.statusText;
      const detailText = courtState === "failed" ? "Refresh failed. Retry to confirm this court." : courtState === "loading" ? "Refreshing court status…" : liveMatch.detailText;
      return `
        <div class="live-score-card court-state ${escapeAttr(liveMatch.statusType)} ${escapeAttr(courtState)}">
          <div class="live-score-card-head">
            ${plate}
            <span class="live-status">${escapeHtml(statusText)}</span>
          </div>
          <p class="live-court-state-detail">${escapeHtml(detailText)}</p>
        </div>
      `;
    }

    const teamAPlayers = liveMatch.teamAPlayers.length ? liveMatch.teamAPlayers.join(" / ") : liveMatch.teamAName;
    const teamBPlayers = liveMatch.teamBPlayers.length ? liveMatch.teamBPlayers.join(" / ") : liveMatch.teamBName;

    if (liveMatch.statusType === "scheduled") {
      return `
        <div class="live-score-card upcoming">
          ${head()}
          <div class="live-score-rows">
            <div class="live-score-row"><div class="live-score-team">${escapeHtml(teamAPlayers)}</div></div>
            <div class="live-score-net" aria-hidden="true"><span>vs</span></div>
            <div class="live-score-row"><div class="live-score-team">${escapeHtml(teamBPlayers)}</div></div>
          </div>
          <div class="live-score-meta">
            <span>${escapeHtml(liveMatch.scoreCallText)}</span>
          </div>
        </div>
      `;
    }

    if (liveMatch.statusType === "completed") {
      // The meta line says who won; the winning Team and Score carry the accent.
      const winnerClass = (team) => (liveMatch.winner === team ? " is-winner" : "");
      return `
        <div class="live-score-card final">
          ${head()}
          <div class="live-score-rows">
            <div class="live-score-row">
              <div class="live-score-team${winnerClass("A")}">${escapeHtml(teamAPlayers)}</div>
              <div class="live-score-number"><strong class="${winnerClass("A")}" data-score-key="live:${escapeAttr(liveMatch.id)}:A">${escapeHtml(liveMatch.scoreA)}</strong></div>
            </div>
            <div class="live-score-net" aria-hidden="true"></div>
            <div class="live-score-row">
              <div class="live-score-team${winnerClass("B")}">${escapeHtml(teamBPlayers)}</div>
              <div class="live-score-number"><strong class="${winnerClass("B")}" data-score-key="live:${escapeAttr(liveMatch.id)}:B">${escapeHtml(liveMatch.scoreB)}</strong></div>
            </div>
          </div>
          <div class="live-score-meta">
            <span>${escapeHtml(liveMatch.scoreCallText)}</span>
            <span>${escapeHtml(liveMatch.durationText)}</span>
          </div>
        </div>
      `;
    }

    const tag = expanded ? "div" : "button";
    const attrs = expanded ? "" : ` type="button" data-action="open-live-score" data-value="${escapeAttr(liveMatch.id)}"`;
    // The Team ahead keeps the bright Score; a tie leaves both bright.
    const scoreA = Number(liveMatch.scoreA) || 0;
    const scoreB = Number(liveMatch.scoreB) || 0;
    const trailing = (team) => ((team === "A" ? scoreA < scoreB : scoreB < scoreA) ? " is-trailing" : "");

    return `
      <${tag} class="live-score-card is-live ${expanded ? "expanded" : ""}"${attrs}>
        ${head()}
        ${liveMatch.source === "tournament" ? "" : `<div class="live-score-admin">${escapeHtml(liveMatch.adminText || "Admin not assigned")}</div>`}
        <div class="live-score-rows">
          <div class="live-score-row${trailing("A")}">
            <div class="live-score-team">${escapeHtml(teamAPlayers)}</div>
            <div class="live-score-number"><strong data-score-key="live:${escapeAttr(liveMatch.id)}:A">${escapeHtml(liveMatch.scoreA)}</strong></div>
          </div>
          <div class="live-score-net" aria-hidden="true"></div>
          <div class="live-score-row${trailing("B")}">
            <div class="live-score-team">${escapeHtml(teamBPlayers)}</div>
            <div class="live-score-number"><strong data-score-key="live:${escapeAttr(liveMatch.id)}:B">${escapeHtml(liveMatch.scoreB)}</strong></div>
          </div>
        </div>
        <div class="live-score-meta">
          <span>${escapeHtml(liveMatch.scoreCallText)}</span>
          ${liveMatch.switchEnds ? '<span class="status-pill scheduled">Switch ends</span>' : ""}
          <span>${escapeHtml(liveMatch.durationText)}</span>
        </div>
      </${tag}>
    `;
  }

  function renderLiveCardRefreshState(courtState) {
    if (!courtState) return "";
    const text = courtState === "failed" ? "Court status unavailable" : "Updating court status";
    return `<span class="live-card-refresh-state ${escapeAttr(courtState)}">${escapeHtml(text)}</span>`;
  }

  function renderLiveScoreOverlay() {
    const liveMatches = liveBoardData().liveMatches;
    const liveMatch = liveMatches.find((match) => match.id === state.liveScoreFocusId) || liveMatches[0] || null;
    return `
      <section class="live-score-overlay" role="dialog" aria-modal="true" aria-labelledby="live-score-dialog-title">
        <div class="live-score-dialog">
          <h2 id="live-score-dialog-title" class="sr-only">Full size live match score</h2>
          <button class="button ghost live-close" data-action="close-live-score">Close</button>
          ${renderLiveScoreCard(liveMatch, true, 0)}
        </div>
      </section>
    `;
  }

  function renderTopPlayerRow(row, index) {
    const rank = index + 1;
    const isPodium = rank <= 3;
    return `
      <div class="top-player-row ${isPodium ? `podium rank-${rank}` : ""}">
        <div class="top-player-rank">
          ${isPodium ? trophyIconSvg(rank) : `<span>${rank}</span>`}
        </div>
        <div class="top-player-name">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${row.games} match${row.games === 1 ? "" : "es"} - ${row.minutesPlayed || 0} min played</span>
        </div>
        <div class="top-player-record">
          <strong>${row.wins}-${row.losses}</strong>
          <span class="${row.winRate >= 50 ? "is-leading" : ""}">${row.winRate}%</span>
        </div>
      </div>
    `;
  }

  function renderLiveNextMatch(match) {
    return `
      <article class="live-next-match">
        <span class="live-next-court" aria-hidden="true"><b>${escapeHtml(match.court)}</b></span>
        <div>
          <span>Round ${match.round} - Court ${match.court}</span>
          <strong>${escapeHtml(match.teamA.join(" / "))}</strong>
          <small>vs ${escapeHtml(match.teamB.join(" / "))}</small>
        </div>
      </article>
    `;
  }

  function trophyIconSvg(rank) {
    return `
      <svg class="trophy-icon trophy-${rank}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 4h8v4.5c0 3-1.7 5-4 5s-4-2-4-5V4Z" fill="currentColor"/>
        <path d="M8 6H5.5v1.4c0 1.6 1 2.8 2.5 3.1M16 6h2.5v1.4c0 1.6-1 2.8-2.5 3.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M12 13.5v3.2M9 20h6M10 16.7h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }

  function liveBoardData() {
    const currentGame = state.currentGame && state.currentGame.status === "active" && state.currentGame.tournamentMatch ? state.currentGame : null;
    const activeGame = currentGame && !currentGame.createdBy ? { ...currentGame, createdBy: currentUserSummary() } : currentGame;
    return window.PaddlePointLiveBoard.buildLiveBoard(state.tournament, activeGame, new Date().toISOString());
  }

  function renderTournament() {
    if (!isStaff()) {
      return renderPlayerDashboard();
    }
    const tournament = { ...defaultTournament, ...state.tournament };
    const form = state.tournamentForm;
    const isPending = Boolean(form.pending);
    const canManageTournament = isSuperAdmin();
    const players = tournamentPlayers();
    const completedMatches = tournament.matches.filter((match) => match.status === "completed").length;
    const hasSchedule = tournament.matches.length > 0;
    const formatEstimate = tournamentFormatEstimate(players.length, tournament);
    const slotCoverage = tournamentSlotCoverage(players, tournament.matches, tournament.matchesPerPlayer);
    const generateFormLabel = isPending ? (hasSchedule ? "Updating schedule…" : "Generating matches…") : (hasSchedule ? "Update Schedule" : "Generate Schedule");
    const pendingAttrs = isPending ? ' disabled aria-busy="true"' : "";

    const workspace = `
      <section class="tournament-layout ${state.refreshingTournament ? "is-updating" : ""}" ${state.refreshingTournament ? 'aria-busy="true"' : ""}>
        ${canManageTournament ? `
          <article class="panel tournament-configuration">
            <div class="workspace-section-head">
              <div>
                <p class="eyebrow">1. Tournament configuration</p>
                <h2>Set up Tournament</h2>
              </div>
              <span>Super Admin</span>
            </div>
          <form id="tournament-form" class="form-grid" data-tournament-form novalidate>
            ${form.failure ? `<p class="form-failure full-width" id="tournament-failure" role="alert">${escapeHtml(form.failure)}</p>` : ""}
            <label class="field full">
              <span class="label">Tournament name</span>
              <input class="input" name="name" data-tournament-field="name" value="${escapeAttr(tournament.name)}" maxlength="48" placeholder="Tournament name">
            </label>
            <label class="field">
              <span class="label">Courts to use</span>
              <input class="input" name="courts" type="number" min="1" max="16" data-tournament-field="courts" value="${tournament.courts !== undefined && tournament.courts !== null ? escapeAttr(tournament.courts) : ""}"${tournamentFieldAttrs("courts", "tournament-courts-help")}>
              <span class="field-help" id="tournament-courts-help">1 to 16 courts available.</span>
              ${tournamentFieldError("courts")}
            </label>
            <label class="field">
              <span class="label">Match target per player</span>
              <input class="input" name="matchesPerPlayer" type="number" min="1" max="30" data-tournament-field="matchesPerPlayer" value="${tournament.matchesPerPlayer !== undefined && tournament.matchesPerPlayer !== null ? escapeAttr(tournament.matchesPerPlayer) : ""}"${tournamentFieldAttrs("matchesPerPlayer", "tournament-matchesPerPlayer-help")}>
              <span class="field-help" id="tournament-matchesPerPlayer-help">1 to 30 matches each.</span>
              ${tournamentFieldError("matchesPerPlayer")}
            </label>
            <label class="field">
              <span class="label">Target score</span>
              <input class="input" name="targetScore" type="number" min="1" max="99" data-tournament-field="targetScore" value="${tournament.targetScore !== undefined && tournament.targetScore !== null ? escapeAttr(tournament.targetScore) : ""}"${tournamentFieldAttrs("targetScore", "tournament-targetScore-help")}>
              <span class="field-help" id="tournament-targetScore-help">Points to win (1-99).</span>
              ${tournamentFieldError("targetScore")}
            </label>
            <label class="field">
              <span class="label">Transition minutes</span>
              <input class="input" name="transitionMinutes" type="number" min="0" max="20" data-tournament-field="transitionMinutes" value="${tournament.transitionMinutes !== undefined && tournament.transitionMinutes !== null ? escapeAttr(tournament.transitionMinutes) : ""}"${tournamentFieldAttrs("transitionMinutes", "tournament-transitionMinutes-help")}>
              <span class="field-help" id="tournament-transitionMinutes-help">0 to 20 minutes between matches.</span>
              ${tournamentFieldError("transitionMinutes")}
            </label>
            <div class="field full">
              <div class="toggle-row">
                <div class="toggle-copy" id="tournament-win-by-two-label">
                  <strong>Win by 2</strong>
                  <span id="tournament-win-by-two-desc">${tournament.winByTwo ? "Use normal pickleball win-by-2 guidance." : "Highest final score wins the match."}</span>
                </div>
                <button
                  type="button"
                  class="switch ${tournament.winByTwo ? "on" : ""}"
                  role="switch"
                  aria-checked="${tournament.winByTwo ? "true" : "false"}"
                  aria-labelledby="tournament-win-by-two-label"
                  aria-describedby="tournament-win-by-two-desc"
                  data-action="toggle-tournament-win-by-two"
                ></button>
              </div>
            </div>
            <label class="field full">
              <span class="label">Registered players</span>
              <textarea class="textarea" name="playersText" data-tournament-field="playersText" rows="9" placeholder="One player per line, or separate names with commas"${tournamentFieldAttrs("playersText", "tournament-playersText-help")}>${escapeHtml(tournament.playersText)}</textarea>
              <span class="field-help" id="tournament-playersText-help">Minimum 4 players. You can add players after play starts, then tap Update Schedule. Completed match results stay saved while pending matches are rebuilt.</span>
              ${tournamentFieldError("playersText")}
            </label>
            <div class="row-actions full-width">
              <button class="button ${hasSchedule ? "ghost" : "primary"}" type="submit"${pendingAttrs}>${generateFormLabel}</button>
              <button class="button ghost quiet-danger" type="button" data-action="reset-tournament"${isPending ? " disabled" : ""}>Reset Tournament</button>
            </div>
          </form>
          ${renderRosterQuickAdd()}
          ${renderTournamentPlayerCreator()}
          ${renderRosteredPlayers(players)}
          <details class="start-event-details" data-start-event-details${state.startEventForm.open || state.startEventForm.failure || state.startEventForm.pending ? " open" : ""}>
            <summary>Start a new Event</summary>
            <form class="form-grid" data-start-event-form novalidate>
              <p class="muted-note full-width">Keeps ${escapeHtml(cleanName(tournament.name, "the current Event"))} and its Matches in History, then switches this workspace to a fresh Event.</p>
              ${state.startEventForm.failure ? `<p class="form-failure full-width" role="alert">${escapeHtml(state.startEventForm.failure)}</p>` : ""}
              <label class="field">
                <span class="label">New Event name</span>
                <input class="input" name="eventName" data-start-event-field="name" value="${escapeAttr(state.startEventForm.name)}" maxlength="48" placeholder="Fall Classic">
              </label>
              <label class="field">
                <span class="label">Courts for the new Event</span>
                <input class="input" type="number" min="1" max="16" name="courts" data-start-event-field="courts" value="${escapeAttr(state.startEventForm.courts)}">
              </label>
              <div class="row-actions full-width">
                <button class="button ghost" type="button" data-action="start-new-event"${state.startEventForm.pending ? " disabled" : ""}>${state.startEventForm.pending ? "Starting…" : "Start New Event"}</button>
              </div>
            </form>
          </details>
          </article>` : `
          <article class="panel tournament-operations">
            <p class="eyebrow">Tournament operations</p>
            <h2>${escapeHtml(cleanName(tournament.name, "Tournament"))}</h2>
            <p>Tournament setup is managed by a Super Admin. Use the current and next rounds below to run matches.</p>
            <div class="operation-status">
              <strong>${completedMatches} completed</strong>
              <span>${tournament.matches.length - completedMatches} matches ready or in progress</span>
            </div>
            ${renderRosteredPlayers(players)}
          </article>`}

        <aside class="tournament-summary-card">
          <p class="eyebrow">2. Format review</p>
          <h2>${escapeHtml(cleanName(tournament.name, "Tournament"))}</h2>
          <p class="muted-note">Review tournament format, player allocations, court capacity, and scheduled match coverage for this event.</p>
          <div class="tournament-stats">
            <div class="stat"><strong>${players.length}</strong><span>Players</span></div>
            <div class="stat"><strong>${tournament.courts}</strong><span>Courts</span></div>
            <div class="stat"><strong>${tournament.matchesPerPlayer}</strong><span>Target each</span></div>
            <div class="stat"><strong>${tournament.matches.length}</strong><span>Matches</span></div>
            <div class="stat"><strong>${completedMatches}</strong><span>Completed</span></div>
          </div>
          <div class="coverage-card">
            <span>Match target coverage</span>
            <strong>${slotCoverage.scheduledSlots} / ${slotCoverage.targetSlots}</strong>
            <small>Each doubles match uses 4 player slots. Target is ${tournament.matchesPerPlayer} match${tournament.matchesPerPlayer === 1 ? "" : "es"} per registered player.</small>
          </div>
          ${renderTournamentFormatEstimate(formatEstimate)}
        </aside>
      </section>`;
    const scheduleBoard = hasSchedule
          ? `<section class="tournament-board">
              ${renderTournamentSchedule(tournament)}
            </section>`
          : `<section class="empty-state tournament-empty">
              <h2>No Schedule yet</h2>
              <p>Add at least four players and tap Generate Schedule. The app will create randomized doubles matches, assign court numbers, and keep a players-only leaderboard as matches finish.</p>
            </section>`;

    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">Tournament</p>
          <h1>${escapeHtml(cleanName(tournament.name, "Doubles Mixer"))}</h1>
          <p>Register players, choose how many courts are available, then generate random doubles matches. Standings rank players only, not fixed teams.${state.lastFetched.tournament ? ` <span class="data-freshness-cue">${formatFreshness(state.lastFetched.tournament, state.refreshingTournament)}</span>` : ""}</p>
        </div>
        <div class="row-actions">
          <button class="button ghost" data-action="refresh-tournament"${state.refreshingTournament ? ' disabled aria-busy="true"' : ""}>${state.refreshingTournament ? "Refreshing…" : "Refresh"}</button>
          ${canManageTournament ? `<button class="button ghost" data-action="clear-tournament-results" ${completedMatches ? "" : "disabled"}>Clear Results</button>` : ""}
        </div>
      </section>

      ${renderRefreshErrorBanner(state.tournamentRefreshError, "refresh-tournament")}

      ${hasSchedule ? `${scheduleBoard}${workspace}` : `${workspace}${scheduleBoard}`}
    `;
  }

  function renderTournamentFormatEstimate(estimate) {
    return `
      <details class="format-estimate">
        <summary>Advanced format calculations <span>${escapeHtml(estimate.eventTimeLabel)}</span></summary>
        <section class="format-card" aria-label="Open Play format estimate">
        <div class="format-card-head">
          <span>Open Play format breakdown</span>
        </div>
        <div class="format-note">
          <strong>Key assumption</strong>
          <span>A mixed doubles match needs 4 players. With ${estimate.courts} court${estimate.courts === 1 ? "" : "s"}, ${estimate.activePlayers} player${estimate.activePlayers === 1 ? "" : "s"} can play at the same time.</span>
        </div>
        <div class="format-grid">
          <div>
            <span>Players per court</span>
            <strong>${estimate.playersPerGame}</strong>
          </div>
          <div>
            <span>Players active at once</span>
            <strong>${estimate.activePlayers}</strong>
          </div>
          <div>
            <span>Players waiting per wave</span>
            <strong>${estimate.waitingPlayers}</strong>
          </div>
          <div>
            <span>Matches for everyone once</span>
            <strong>${estimate.gamesPerRotation}</strong>
          </div>
          <div>
            <span>Waves per rotation</span>
            <strong>${estimate.wavesPerRotation}</strong>
          </div>
        </div>
        <table class="format-table">
          <tbody>
            <tr><th>Time per wave</th><td>${estimate.averageGameMinutes} min match + ${estimate.transitionMinutes} min transition = ${estimate.waveMinutes} min</td></tr>
            <tr><th>Time per full rotation</th><td>${estimate.wavesPerRotation} wave${estimate.wavesPerRotation === 1 ? "" : "s"} x ${estimate.waveMinutes} min = ${escapeHtml(estimate.rotationTimeLabel)}</td></tr>
            <tr><th>If each player plays ${estimate.matchesPerPlayer}</th><td>${estimate.totalGames} total matches, ${estimate.totalWaves} waves</td></tr>
            <tr><th>Actual playing time each</th><td>${escapeHtml(estimate.playingTimeLabel)}</td></tr>
          </tbody>
        </table>
        </section>
      </details>
    `;
  }

  function renderTournamentSchedule(tournament) {
    const rounds = groupMatchesByRound(tournament.matches);
    const currentRound = rounds.find((round) => round.matches.some((match) => match.status === "in_progress")) || rounds.find((round) => round.matches.some((match) => match.status === "scheduled"));
    const nextRound = currentRound && rounds.find((round) => round.round > currentRound.round && round.matches.some((match) => match.status === "scheduled"));
    const renderRound = (round) => `
      <article class="round-card">
        <div class="round-head">
          <h3>Round ${round.round}</h3>
          <span>${round.matches.length} court${round.matches.length === 1 ? "" : "s"}</span>
        </div>
        <div class="match-grid">
          ${round.matches.map(renderTournamentMatch).join("")}
        </div>
      </article>`;

    return `
      <section class="schedule-section ${state.refreshingTournament ? "is-updating" : ""}" ${state.refreshingTournament ? 'aria-busy="true"' : ""}>
        <div class="schedule-head">
          <div>
            <p class="eyebrow">Match schedule</p>
            <h2>${escapeHtml(tournament.matches.length)} doubles matches</h2>
          </div>
          <span>${escapeHtml(formatDateTime(tournament.generatedAt))}</span>
        </div>
        <div class="schedule-progress">
          <progress class="lead-progress" max="${tournament.matches.length}" value="${tournament.matches.filter((match) => match.status === "completed").length}" aria-label="Matches completed"></progress>
          <span>${tournament.matches.filter((match) => match.status === "completed").length} of ${tournament.matches.length} done</span>
        </div>
        <div class="round-list">
          ${rounds
            .map((round) => {
              const isCurrent = currentRound && round.round === currentRound.round;
              const isNext = nextRound && round.round === nextRound.round;
              if (isCurrent || isNext) {
                return `<section class="round-group ${isCurrent ? "current-round" : "next-round"}">
                  <p>${isCurrent ? "Current round" : "Next round"}</p>
                  ${renderRound(round)}
                </section>`;
              }
              const isCompleted = round.matches.every((match) => match.status === "completed");
              return `<details class="round-group ${isCompleted ? "completed-round" : "future-round"}">
                <summary>${isCompleted ? "Completed" : "Future"} round ${round.round}: ${round.matches.length} court${round.matches.length === 1 ? "" : "s"}</summary>
                ${renderRound(round)}
              </details>`;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  // The one Match whose card carries the primary action: the Match being scored on this device,
  // otherwise the next scheduled Match. Empty when nothing is left to start.
  function tournamentPrimaryMatchId(matches, activeMatchId) {
    const list = Array.isArray(matches) ? matches : [];
    if (activeMatchId && list.some((match) => match.id === activeMatchId && match.status === "in_progress")) return activeMatchId;
    const next = list
      .filter((match) => match.status === "scheduled")
      .sort((a, b) => (a.round || 0) - (b.round || 0) || (a.court || 0) - (b.court || 0))[0];
    return next ? next.id : "";
  }

  // A Player is on one court at a time. Names the first Player of this Match who is already
  // in another ongoing Match, and the court they are on. The server enforces this; this is the cue.
  function busyPlayerNote(matches, match) {
    const keys = (item) => [...(item.teamA || []), ...(item.teamB || [])]
      .map((player) => String(player || "").trim())
      .filter(Boolean);
    const starting = new Set(keys(match).map((player) => player.toLowerCase()));

    for (const other of Array.isArray(matches) ? matches : []) {
      if (!other || other.status !== "in_progress" || other.id === match.id) continue;
      const busy = keys(other).find((player) => starting.has(player.toLowerCase()));
      if (busy) return `${busy} is already playing on Court ${other.court}`;
    }

    return "";
  }

  function renderTournamentMatch(match) {
    const scoreA = match.scoreA || "";
    const scoreB = match.scoreB || "";
    const isCompleted = match.status === "completed";
    const isOngoing = match.status === "in_progress";
    const currentActiveMatchId = state.currentGame && state.currentGame.status === "active" && state.currentGame.tournamentMatch ? state.currentGame.tournamentMatch.matchId : "";
    const isCurrentActive = isOngoing && currentActiveMatchId === match.id;
    const isPrimaryMatch = tournamentPrimaryMatchId(state.tournament.matches, currentActiveMatchId) === match.id;
    const startedBy = match.startedBy && match.startedBy.displayName ? match.startedBy.displayName : "";
    const winnerLabel =
      isCompleted ? `${match.winner === "A" ? "Team A" : "Team B"} won` : isOngoing ? "Ongoing Match" : "Ready to start";
    let actionBlock = "";

    if (isCompleted) {
      actionBlock = `<div class="match-actions locked">
          <div class="match-result-pill">
            <span>Final</span>
            <strong>${escapeHtml(scoreA)} - ${escapeHtml(scoreB)}</strong>
          </div>
          <span class="locked-badge">Locked</span>
        </div>`;
    } else if (isOngoing) {
      actionBlock = `<div class="match-actions ongoing">
          ${
            isCurrentActive
              ? '<button class="button primary" data-action="resume-game">Resume Match</button>'
              : canTakeOverMatch(match)
              ? `<button class="button primary" data-action="take-over-tournament-match" data-value="${escapeAttr(match.id)}">Take Over Scoring</button>`
              : '<button class="button ghost" disabled>Ongoing Match</button>'
          }
          <span class="muted-note">Match started${startedBy ? ` by ${escapeHtml(startedBy)}` : ""}. Other admins cannot start this match.</span>
        </div>`;
    } else {
      const busyNote = busyPlayerNote(state.tournament.matches, match);
      actionBlock = `<div class="match-actions">
          ${
            busyNote
              ? `<button class="button ghost" data-action="start-tournament-match" data-value="${escapeAttr(match.id)}" disabled>Start Match</button>`
              : `<button class="button ${isPrimaryMatch ? "primary" : "ghost"}" data-action="start-tournament-match" data-value="${escapeAttr(match.id)}">Start Match</button>`
          }
          <span class="muted-note">${busyNote ? escapeHtml(busyNote) : "Score is recorded from the Scoreboard after the match ends."}</span>
        </div>`;
    }

    return `
      <article class="match-card ${isCompleted ? "completed" : ""} ${isOngoing ? "in-progress" : ""}">
        <div class="match-card-head">
          <span>Court ${match.court}</span>
          <strong>${escapeHtml(winnerLabel)}</strong>
        </div>
        <div class="match-versus">
          <div class="match-team">
            <span>Team A</span>
            <strong>${match.teamA.map(escapeHtml).join(" / ")}</strong>
          </div>
          <div class="match-vs">VS</div>
          <div class="match-team">
            <span>Team B</span>
            <strong>${match.teamB.map(escapeHtml).join(" / ")}</strong>
          </div>
        </div>
        ${actionBlock}
      </article>
    `;
  }

  function renderRules() {
    return `
      <section class="page-title">
        <div>
          <p class="eyebrow">Rules guide</p>
          <h1>Side-out Scoring</h1>
          <p>The app uses standard pickleball side-out scoring for both singles and doubles.</p>
        </div>
      </section>
      <section class="rules-topic" aria-labelledby="rules-score-calls">
        <h2 id="rules-score-calls">Score calls</h2>
        <div class="rules-topic-body">
          <div>
            <h3>Doubles</h3>
            <ul>
              <li>Call server score - receiver score - server number.</li>
              <li>The first service starts at 0 - 0 - 2.</li>
              <li>The right-side player starts a service turn; the first service of a match is the exception and is called server 2.</li>
              <li>If server 1 loses a rally, service moves to server 2 without switching sides.</li>
              <li>If server 2 loses a rally, it is a side-out to the other team.</li>
            </ul>
          </div>
          <div>
            <h3>Singles</h3>
            <ul>
              <li>Call server score - receiver score.</li>
              <li>No server number is used.</li>
              <li>Only the serving player can score.</li>
              <li>Losing a rally on serve gives service to the opponent.</li>
            </ul>
          </div>
        </div>
      </section>
      <section class="rules-topic" aria-labelledby="rules-serving-positions">
        <h2 id="rules-serving-positions">Serving positions</h2>
        <ul>
          <li>Only the serving side earns points.</li>
          <li>When the serving team wins a rally, that team's partners switch sides.</li>
          <li>When server 1 loses a rally, server 2 serves from where that partner is standing.</li>
          <li>The receiving side does not switch sides.</li>
        </ul>
      </section>
      <section class="rules-topic" aria-labelledby="rules-winning">
        <h2 id="rules-winning">Winning a Match</h2>
        <ul>
          <li>With win by 2 on, a team must reach the target and lead by 2.</li>
          <li>With win by 2 off, the first team to reach the target wins.</li>
          <li>The app detects the winner immediately after a scoring rally.</li>
        </ul>
      </section>
    `;
  }

  function updateSetup(patch) {
    if (!requireMatchControlAccess()) return;
    state.setup = normalizeSetup({ ...state.setup, ...patch });
    saveSetup();
    update();
  }

  function updateSetupText(field, value) {
    if (!isStaff() && !isVisitor()) return;
    if (!TEXT_SETUP_FIELDS.has(field)) return;
    const limit = TEXT_FIELD_LIMITS[field] || 64;
    state.setup = {
      ...state.setup,
      [field]: String(value || "").slice(0, limit),
    };
    if (state.setupErrors && state.setupErrors[field]) {
      delete state.setupErrors[field];
      const inputEl = app.querySelector(`[data-field="${field}"]`);
      if (inputEl) {
        inputEl.removeAttribute("aria-invalid");
        inputEl.removeAttribute("aria-describedby");
      }
      const errEl = app.querySelector(`#setup-${field}-error`);
      if (errEl) errEl.remove();
    }
    updateSetupTextHints(field);
    saveSetupSoon();
  }

  function updateTournament(patch) {
    if (!isSuperAdmin()) return;
    state.tournament = normalizeTournament({ ...state.tournament, ...patch });
    saveTournament();
    update();
  }

  function updateTournamentField(field, value) {
    if (!isSuperAdmin()) return;
    if (TOURNAMENT_TEXT_FIELDS.has(field)) {
      const limit = field === "playersText" ? 4000 : 48;
      state.tournament = {
        ...state.tournament,
        [field]: String(value || "").slice(0, limit),
      };
      saveTournamentSoon();
      return;
    }

    if (TOURNAMENT_NUMBER_FIELDS.has(field)) {
      state.tournament = {
        ...state.tournament,
        [field]: value,
      };
      saveTournamentSoon();
    }
  }

  function saveTournamentSoon() {
    window.clearTimeout(tournamentSaveTimer);
    tournamentSaveTimer = window.setTimeout(saveTournament, 250);
  }

  function updateSetupTextHints(field) {
    if (/^team[AB]Player/.test(field) || field === "type") {
      updateText('[data-preview-team="A"]', setupTeamLabel("A"));
      updateText('[data-preview-team="B"]', setupTeamLabel("B"));
    }
    if (field === "teamAName") {
      updateText('[data-first-server-name="A"]', cleanName(state.setup.teamAName, "Team A"));
    }
    if (field === "teamBName") {
      updateText('[data-first-server-name="B"]', cleanName(state.setup.teamBName, "Team B"));
    }
  }

  function updateText(selector, value) {
    const target = app.querySelector(selector);
    if (target) target.textContent = value;
  }

  function saveSetupSoon() {
    window.clearTimeout(setupSaveTimer);
    setupSaveTimer = window.setTimeout(saveSetup, 250);
  }

  function setView(view, { fromHistory = false } = {}) {
    if (!session.isSignedIn()) {
      state.view = "login";
      state.mobileNavOpen = false;
      update();
      return;
    }
    const resolved = viewAccess.resolveView(view, session.permissions());
    const isRedirect = resolved.view !== view;

    if (isRedirect) {
      state.view = resolved.view;
      state.mobileNavOpen = false;
      pendingViewFocus = true;
      replaceViewUrl(resolved.view);
      if (resolved.message) {
        showToast(resolved.message);
      }
      triggerViewData(resolved.view);
      update();
      scrollToPageTopSoon();
      return;
    }

    if (state.view === resolved.view) {
      state.mobileNavOpen = false;
      pendingViewFocus = true;
      update();
      return;
    }

    state.view = resolved.view;
    state.mobileNavOpen = false;
    pendingViewFocus = true;

    if (!fromHistory) {
      pushViewUrl(resolved.view);
    }

    triggerViewData(resolved.view);
    update();
    scrollToPageTopSoon();
  }

  function triggerViewData(view) {
    // The Leaderboard always opens on the Current Event; All Events is a per-visit choice.
    if (view === "leaderboard") state.leaderboardScope = "current";
    if (view === "history" || view === "leaderboard") {
      refreshSharedHistory(false);
      refreshSharedLeaderboard(false);
    }
    if (view === "home" && isVisitor()) {
      refreshSharedLeaderboard(false);
    }
    if (view === "tournament" || view === "live" || (view === "home" && isStaff())) {
      refreshSharedTournament(false);
    }
    if (view === "home" && isStaff()) {
      fetchUserCounts();
      fetchQlikReloadTime();
    }
    if (view === "analytics" && isStaff()) {
      fetchQlikReloadTime();
    }
    state.liveScoreExpanded = false;
    if (view === "setup") {
      applyCurrentUserToSetup();
    }
    if (view === "profile") {
      const user = session.user();
      if (user && (state.profileForm.displayName === undefined || state.profileForm.displayName === "")) {
        state.profileForm.displayName = user.displayName;
      }
    }
    if (view === "people" && isSuperAdmin()) {
      fetchUsers(false);
    }
    if (view === "players" && isStaff()) {
      fetchPlayers(false);
    }
    if (view === "tournament" && isStaff()) {
      fetchPlayers(false);
    }
  }

  function startDefaultGame(trigger, replaceConfirmed) {
    if (!requireMatchControlAccess()) return;
    if (!replaceConfirmed && requestReplaceActive(() => startDefaultGame(null, true), trigger)) return;
    state.setup = normalizeSetup({ ...defaultSetup });
    applyCurrentUserToSetup();
    saveSetup();
    startGame(true);
  }

  function startGame(skipActiveConfirm, trigger) {
    if (!requireMatchControlAccess()) return;
    if (!skipActiveConfirm && requestReplaceActive(() => startGame(true), trigger)) return;

    state.setup = normalizeSetup(state.setup);
    saveSetup();

    const setup = state.setup;
    const errors = setupValidation ? setupValidation.setupErrors(setup) : {};
    if (Object.keys(errors).length > 0) {
      state.setupErrors = errors;
      state.view = "setup";
      const firstInvalid = Object.keys(errors)[0];
      showToast(errors[firstInvalid] || "Enter valid player names");
      renderNowAndFocus(`[data-field="${firstInvalid}"]`);
      return;
    }
    state.setupErrors = {};

    const isDoubles = setup.type === "doubles";
    const playersA = isDoubles
      ? [setup.teamAPlayer1.trim(), setup.teamAPlayer2.trim()]
      : [setup.teamAPlayer1.trim()];
    const playersB = isDoubles
      ? [setup.teamBPlayer1.trim(), setup.teamBPlayer2.trim()]
      : [setup.teamBPlayer1.trim()];

    const game = rallyEngine.createGame({
      type: setup.type,
      scorerName: setup.scorerName,
      teamA: {
        name: "Team A",
        players: playersA,
        startingRight: setup.teamARight,
      },
      teamB: {
        name: "Team B",
        players: playersB,
        startingRight: setup.teamBRight,
      },
      firstServer: setup.firstServer,
      targetScore: setup.targetScore,
      winByTwo: setup.winByTwo,
      createdBy: currentUserSummary(),
      matchScope: isVisitor() ? "visitor" : "standard",
    });

    state.currentGame = game;
    state.summaryGame = null;
    state.recoveryPrompt = false;
    state.undoStack = [];
    state.view = "scoreboard";
    saveActiveGame();
    update();
    showToast("Match started");
  }

  async function startTournamentMatch(matchId, replaceConfirmed, trigger, toss) {
    if (!isStaff()) {
      showToast("Admin access required");
      return;
    }
    if (!replaceConfirmed && requestReplaceActive(() => startTournamentMatch(matchId, true), trigger)) return;

    await refreshSharedTournament(false, { silent: true });
    state.tournament = normalizeTournament(state.tournament);
    const tournament = state.tournament;
    const match = tournament.matches.find((item) => item.id === matchId);
    if (!match) {
      showToast("Tournament match was not found");
      return;
    }
    if (match.status === "completed") {
      showToast("Match is already completed and locked");
      return;
    }
    if (match.status === "in_progress") {
      const activeMatchId = state.currentGame && state.currentGame.status === "active" && state.currentGame.tournamentMatch ? state.currentGame.tournamentMatch.matchId : "";
      if (activeMatchId === match.id) {
        resumeGame();
      } else {
        showToast("Match is already ongoing");
      }
      return;
    }

    const busyNote = busyPlayerNote(tournament.matches, match);
    if (busyNote) {
      showToast(busyNote);
      return;
    }

    const busyCourts = new Set(tournament.matches.filter((item) => item.status === "in_progress").map((item) => Number(item.court)));
    const courtCount = Number(tournament.courts) || Math.max(1, ...tournament.matches.map((item) => Number(item.court) || 0));
    const court = Array.from({ length: courtCount }, (_, index) => index + 1).find((number) => !busyCourts.has(number));
    if (!court) {
      showToast("All courts are playing; wait for a court to open");
      return;
    }

    if (!toss) {
      requestChoiceConfirmation({
        title: `Start Round ${match.round}, Court ${court}?`,
        description: "Set who won the toss: the Team serving first and the Player starting in each Team's right court.",
        cancelLabel: "Cancel",
        confirmLabel: "Start Match",
        fields: startMatchChoiceFields(match),
      }, (choices) => startTournamentMatch(matchId, true, trigger, choices || {}), trigger);
      return;
    }

    const game = tournamentGameFor(tournament, { ...match, court }, {
      firstServer: toss.firstServer,
      startingRight: { A: Number(toss.rightA) || 0, B: Number(toss.rightB) || 0 },
    });

    const updatePayload = tournamentMatchUpdateFromGame(game, "in_progress");
    const result = await postSharedTournamentMatch(updatePayload, { silent: true, intent: "start-match" });
    if (!result || !result.ok) {
      showToast(result && result.error ? result.error : "Match could not be started");
      return;
    }

    game.scoringClaim = result.match?.scoringClaim;
    state.currentGame = game;
    state.summaryGame = null;
    state.recoveryPrompt = false;
    state.undoStack = [];
    state.view = "scoreboard";
    saveActiveGame();
    update();
    scrollToPageTopSoon();
    showToast(`Match started: Round ${match.round}, Court ${court}`);
  }

  // What the court can disagree with the Scoreboard about: who is serving, which serve it is, and who stands where.
  function correctServeChoiceFields(game) {
    const playerName = (key, index) => rallyEngine.playerNameByIndex(game, key, index);
    const serverOptions = ["A", "B"].flatMap((key) => [0, 1].map((index) => [`${key}${index}`, playerName(key, index)]));
    return [
      { key: "server", legend: "Serving", value: `${game.servingTeam}${game.currentServerIndex}`, options: serverOptions },
      { key: "serverNumber", legend: "Which serve", value: String(game.serverNumber), options: [["1", "First server"], ["2", "Second server"]] },
      { key: "rightA", legend: `${rallyEngine.teamName(game, "A")} right court`, value: String(game.teamA.positions.right), options: [0, 1].map((index) => [String(index), playerName("A", index)]) },
      { key: "rightB", legend: `${rallyEngine.teamName(game, "B")} right court`, value: String(game.teamB.positions.right), options: [0, 1].map((index) => [String(index), playerName("B", index)]) },
    ];
  }

  // A Team stops play. The Score, serve and positions stay as they are.
  function callTimeout(key) {
    if (!requireMatchControlAccess()) return;
    const game = state.currentGame;
    if (!game || game.status !== "active") return;
    if (!rallyEngine.recordTimeout(game, key)) {
      showToast(`${teamName(game, key)} has no timeouts left`);
      return;
    }
    saveActiveGame();
    update();
    showToast(`Timeout: ${teamName(game, key)}, ${timeoutsLeft(game, key)} left`);
  }

  // The court and the Scoreboard disagree: the scorer says where the serve really is.
  function correctServe(trigger) {
    if (!requireMatchControlAccess()) return;
    const game = state.currentGame;
    if (!game || game.status !== "active" || game.type !== "doubles") return;

    requestChoiceConfirmation({
      eyebrow: "Match correction",
      title: "Correct the serve?",
      description: "Set who is serving, which serve it is, and which Player stands in each Team's right court.",
      cancelLabel: "Cancel",
      confirmLabel: "Correct Serve",
      fields: correctServeChoiceFields(game),
    }, (choices) => {
      const server = String((choices && choices.server) || "");
      const correction = {
        servingTeam: server.slice(0, 1),
        serverIndex: Number(server.slice(1)),
        serverNumber: Number(choices && choices.serverNumber),
        rightA: Number(choices && choices.rightA),
        rightB: Number(choices && choices.rightB),
      };
      const unchanged = correction.servingTeam === game.servingTeam
        && correction.serverIndex === game.currentServerIndex
        && correction.serverNumber === game.serverNumber
        && correction.rightA === game.teamA.positions.right
        && correction.rightB === game.teamB.positions.right;
      if (unchanged) return;
      rallyEngine.correctServe(game, correction);
      syncLiveTournamentScoreFromGame(game);
      saveActiveGame();
      update();
      showToast(`Serve corrected: ${rallyEngine.currentServerName(game)} serving`);
    }, trigger);
  }

  // The toss winner names the serving Team and each Team's right-court Player before the first serve.
  function startMatchChoiceFields(match) {
    const teamLabel = (players) => players.map((player) => String(player).trim()).filter(Boolean).join(" / ");
    const playerLabel = (players, index) => String(players[index] || "").trim() || `Player ${index + 1}`;
    return [
      { key: "firstServer", legend: "Serves first", value: "A", options: [["A", teamLabel(match.teamA)], ["B", teamLabel(match.teamB)]] },
      { key: "rightA", legend: `${teamLabel(match.teamA)} starts on the right`, value: "0", options: [["0", playerLabel(match.teamA, 0)], ["1", playerLabel(match.teamA, 1)]] },
      { key: "rightB", legend: `${teamLabel(match.teamB)} starts on the right`, value: "0", options: [["0", playerLabel(match.teamB, 0)], ["1", playerLabel(match.teamB, 1)]] },
    ];
  }

  // A new Game scoring a Tournament Match on this device. options.id and options.now keep an existing Game's lock and start time.
  function tournamentGameFor(tournament, match, options = {}) {
    return rallyEngine.createGame({
      id: options.id,
      now: options.now,
      type: "doubles",
      scorerName: cleanName(session.user() && session.user().displayName, "Tournament"),
      teamA: {
        name: cleanName(match.teamA.join(" / "), "Team A"),
        players: match.teamA.slice(0, 2),
        startingRight: options.startingRight ? options.startingRight.A : 0,
      },
      teamB: {
        name: cleanName(match.teamB.join(" / "), "Team B"),
        players: match.teamB.slice(0, 2),
        startingRight: options.startingRight ? options.startingRight.B : 0,
      },
      firstServer: options.firstServer === "B" ? "B" : "A",
      targetScore: clampNumber(tournament.targetScore, 1, 99),
      winByTwo: Boolean(tournament.winByTwo),
      createdBy: currentUserSummary(),
      matchScope: "tournament",
      tournamentMatch: {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        matchId: match.id,
        round: match.round,
        court: match.court,
      },
    });
  }

  // An ongoing Match whose scoreboard is gone can be taken over by the Admin who started it or by a Super Admin.
  function canTakeOverMatch(match) {
    const user = session.user();
    if (!user || !match || match.status !== "in_progress" || !match.activeGameId) return false;
    return isSuperAdmin() || Boolean(match.startedBy && Number(match.startedBy.id) === Number(user.id));
  }

  async function takeOverTournamentMatch(matchId, confirmed, trigger) {
    if (!confirmed) {
      if (requestReplaceActive(() => takeOverTournamentMatch(matchId, true), trigger)) return;
      const listed = state.tournament && Array.isArray(state.tournament.matches) ? state.tournament.matches.find((item) => item.id === matchId) : null;
      requestDestructiveConfirmation({
        title: `Take over ${listed ? `Round ${listed.round}, Court ${listed.court}` : "this Match"}?`,
        description: "Scoring continues on this device from the Score shown. Only take over when no other device is scoring this Match.",
        cancelLabel: "Cancel",
        confirmLabel: "Take Over Scoring",
      }, () => takeOverTournamentMatch(matchId, true), trigger);
      return;
    }

    await refreshSharedTournament(false, { silent: true });
    state.tournament = normalizeTournament(state.tournament);
    const match = state.tournament.matches.find((item) => item.id === matchId);
    if (!canTakeOverMatch(match)) {
      showToast("This Match can no longer be taken over");
      return;
    }

    // Reusing the Match's activeGameId makes this device its scoreboard without unlocking it.
    const game = tournamentGameFor(state.tournament, match, { id: match.activeGameId, now: match.startedAt || undefined });
    // ponytail: only the Score survives on the server; serve order restarts. Persist rally events server-side if that matters.
    game.teamA.score = Number(match.scoreA) || 0;
    game.teamB.score = Number(match.scoreB) || 0;

    const result = await postSharedTournamentMatch(tournamentMatchUpdateFromGame(game, "in_progress"), { silent: true, intent: "start-match" });
    if (!result || !result.ok) {
      showToast(result && result.error ? result.error : "Match could not be taken over");
      return;
    }

    game.scoringClaim = result.match?.scoringClaim;
    state.currentGame = game;
    state.summaryGame = null;
    state.recoveryPrompt = false;
    state.undoStack = [];
    state.view = "scoreboard";
    saveActiveGame();
    update();
    scrollToPageTopSoon();
    showToast(`Scoring taken over: Round ${match.round}, Court ${match.court}`);
  }

  function resumeGame() {
    if (!requireMatchControlAccess()) return;
    if (!state.currentGame || state.currentGame.status !== "active") {
      state.currentGame = null;
      clearUnavailableActiveGameForRole();
    }
    state.recoveryPrompt = false;
    state.view = state.currentGame ? "scoreboard" : "setup";
    update();
  }

  function continueRecoveredMatch() {
    if (!requireMatchControlAccess()) return;
    state.recoveryPrompt = false;
    resumeGame();
    renderNowAndFocus('[data-action="rally"][data-value="A"]', '.scoreboard');
  }

  function resetRecoveredMatch() {
    if (!requireMatchControlAccess()) return;
    state.recoveryPrompt = false;
    resetCurrentGameInPlace();
    showToast("Match reset to 0-0");
    renderNowAndFocus('[data-action="rally"][data-value="A"]', '.scoreboard');
  }

  function setLiveCourt(value) {
    state.liveCourt = clampNumber(value, 1, 4);
    state.liveScoreExpanded = false;
    state.liveScoreFocusId = "";
    update();
  }

  function setLiveTab(value) {
    state.liveTab = value === "next" ? "next" : "ongoing";
    state.liveScoreExpanded = false;
    state.liveScoreFocusId = "";
    update();
  }

  function openLiveScore(matchId) {
    const liveMatches = liveBoardData().liveMatches;
    if (!liveMatches.length) {
      showToast("No live match right now");
      return;
    }
    const focusedMatch = liveMatches.find((match) => match.id === matchId) || liveMatches[0];
    savedLiveScoreTrigger = `[data-action="open-live-score"][data-value="${focusedMatch.id}"]`;
    state.liveScoreFocusId = focusedMatch.id;
    state.liveScoreExpanded = true;
    renderNowAndFocus('.live-score-overlay [data-action="close-live-score"]', '.live-score-overlay');
  }

  function closeLiveScore() {
    state.liveScoreExpanded = false;
    state.liveScoreFocusId = "";
    const returnSelector = savedLiveScoreTrigger;
    const returnElement = savedLiveScoreTriggerElement;
    savedLiveScoreTrigger = null;
    savedLiveScoreTriggerElement = null;
    update();
    if (renderScheduler) renderScheduler.flush();
    const target = (returnSelector ? app.querySelector(returnSelector) : null) || returnElement;
    const fallback = app.querySelector('[data-action="live-court"]') || app.querySelector(".page") || app;
    const toFocus = (target && document.contains(target)) ? target : fallback;
    if (toFocus && typeof toFocus.focus === "function") {
      toFocus.focus();
    }
  }

  function applyRally(rallyWinner) {
    if (!requireMatchControlAccess()) return;
    const game = state.currentGame;
    if (!game || game.status !== "active") return;

    const outcome = rallyEngine.recordRally(game, rallyWinner);
    if (!outcome) return;

    if (outcome.winner) {
      completeGame(game, outcome.winner, false);
    } else {
      syncLiveTournamentScoreFromGame(game);
      saveActiveGame();
      update();
    }
  }

  function undoLastRally() {
    if (!requireMatchControlAccess()) return;
    if (!state.currentGame) return;
    const previous = rallyEngine.undoRally(state.currentGame);
    if (!previous) return;
    state.summaryGame = null;
    syncLiveTournamentScoreFromGame(state.currentGame);
    saveActiveGame();
    update();
  }

  function resetActiveGame(trigger) {
    if (!requireMatchControlAccess()) return;
    const game = state.currentGame;
    if (!game || game.status !== "active") return;
    requestDestructiveConfirmation({
      title: `Reset ${gameTitle(game)}?`,
      description: `${gameTitle(game)} is currently ${finalScore(game)}. Resetting clears its score and rally history, keeps the Match active, and syncs an in-progress 0-0 result.`,
      cancelLabel: "Keep Match",
      confirmLabel: "Reset Match",
    }, resetCurrentGameInPlace, trigger);
  }

  function resetCurrentGameInPlace() {
    if (!requireMatchControlAccess()) return;
    const game = state.currentGame;
    if (!game || game.status !== "active") {
      state.view = "setup";
      update();
      return;
    }

    const now = new Date().toISOString();
    rallyEngine.resetGame(game, { now });

    state.summaryGame = null;
    state.undoStack = [];
    state.setup = gameToSetup(game);
    state.view = "scoreboard";
    saveSetup();
    saveActiveGame();
    syncResetTournamentMatchFromGame(game, now);
    update();
  }

  function syncResetTournamentMatchFromGame(game, startedAt) {
    if (!game || !game.tournamentMatch) return;
    state.tournament = normalizeTournament(state.tournament);
    const match = state.tournament.matches.find((item) => item.id === game.tournamentMatch.matchId);
    if (!match || match.status === "completed") return;

    postSharedTournamentMatch(tournamentMatchUpdateFromGame(game, "in_progress"), { silent: true, intent: "score-sync" });
  }

  function endGameEarly(trigger) {
    if (!requireMatchControlAccess()) return;
    const game = state.currentGame;
    if (!game || game.status !== "active") return;
    requestDestructiveConfirmation({
      title: `Which Team retired or forfeited?`,
      description: `${gameTitle(game)} is currently ${finalScore(game)}. The other Team will be recorded as the winner and the Match will be saved in History.`,
      cancelLabel: "Continue Match",
      choices: [
        { value: "A", label: `${game.teamA.name} retired or forfeited` },
        { value: "B", label: `${game.teamB.name} retired or forfeited` },
      ],
    }, (retiredTeam) => {
      rallyEngine.endGameEarly(game, { retiredTeam });
      completeGame(game, game.winner, true);
    }, trigger);
  }

  async function completeGame(game, winner, endedEarly) {
    if (!isStaff() && !isVisitor()) return;
    if (isVisitor()) stampVisitorGame(game);
    game.status = "completed";
    game.winner = winner;
    game.endedEarly = endedEarly;
    game.endedAt = new Date().toISOString();
    const matchResult = await syncTournamentMatchFromGame(game);
    if (matchResult && matchResult.error === "Scoring moved to another device") return;
    state.summaryGame = clone(game);
    state.currentGame = null;
    state.recoveryPrompt = false;
    state.undoStack = [];
    state.view = "summary";
    clearActiveGame();
    saveCompletedGame(game);
    update();
    showToast(`${teamName(game, winner)} wins ${finalScore(game)}`);
  }

  async function syncTournamentMatchFromGame(game) {
    if (!isStaff()) return;
    if (!game || !game.tournamentMatch) return;
    state.tournament = normalizeTournament(state.tournament);
    const match = state.tournament.matches.find((item) => item.id === game.tournamentMatch.matchId);
    if (!match) {
      showToast("Match saved, but its Tournament Match was not found");
      return;
    }
    if (!game.winner) {
      const result = await postSharedTournamentMatch(tournamentMatchUpdateFromGame(game, "scheduled"), { intent: "unlock-match" });
      showToast("Tournament match was not locked because no winner was recorded");
      return result;
    }

    return postSharedTournamentMatch(tournamentMatchUpdateFromGame(game, "completed"), { intent: "complete-match" });
  }

  function syncLiveTournamentScoreFromGame(game) {
    if (!isStaff()) return;
    if (!game || !game.tournamentMatch || game.status !== "active") return;
    state.tournament = normalizeTournament(state.tournament);
    const match = state.tournament.matches.find((item) => item.id === game.tournamentMatch.matchId);
    if (!match || match.status === "completed") return;

    postSharedTournamentMatch(tournamentMatchUpdateFromGame(game, "in_progress"), { silent: true, intent: "score-sync" });
  }

  function detectWinner(game) {
    return rallyEngine ? rallyEngine.detectWinner(game) : null;
  }

  function saveCompletedGame(game) {
    if (!isStaff() && !isVisitor()) {
      showToast("Player accounts can view and share results only");
      return;
    }
    const savedGame = clone(game);
    if (isVisitor()) stampVisitorGame(savedGame);
    savedGame.scorerName = cleanName(savedGame.scorerName || state.setup.scorerName, "Court 1");
    if (isVisitor()) {
      state.history = mergeHistoryGames([savedGame], state.history);
      state.historyStatus = "Latest visitor match saved in this browser; syncing shared history.";
      saveHistory();
    } else {
      const exists = state.history.some((item) => item.id === savedGame.id);
      if (!exists) {
      state.history = [savedGame, ...state.history].slice(0, 100);
      saveHistory();
      }
    }
    postSharedGame(savedGame);
  }

  function clearHistory(trigger) {
    requestDestructiveConfirmation({
      title: "Clear local History cache?",
      description: "This removes cached Match History from this browser only. Shared database records are not deleted and will appear again after PaddlePointer refreshes them.",
      cancelLabel: "Keep Local History",
      confirmLabel: "Clear Local Cache",
    }, async () => {
      let cleared = true;
      try {
        window.localStorage.removeItem(HISTORY_KEY);
        if (sharedStore) {
          sharedStore.setHistory([], { persist: true });
        }
        state.history = [];
        state.historySource = "local";
      } catch (error) {
        cleared = false;
      }
      state.historyStatus = cleared
        ? "Local history cache cleared. Shared database records were not deleted."
        : "Local history cache could not be cleared. Shared database records were not changed.";
      showToast(state.historyStatus);
      await refreshSharedHistory(false);
    }, trigger);
  }

  async function openHistorySummary(id) {
    const game = visibleHistory().find((item) => item.id === id);
    if (!game) return;
    state.summaryGame = clone(game);
    state.view = "summary";
    update();

    if (!Array.isArray(game.events) && game._shared) {
      try {
        const response = await fetch(`${API_BASE}/get-game.php?id=${encodeURIComponent(id)}&_=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: session.headers(),
        });
        const payload = await response.json();
        if (response.ok && payload.ok && payload.game) {
          if (state.summaryGame && state.summaryGame.id === id) {
            state.summaryGame = clone(payload.game);
            update();
          }
        }
      } catch (error) {
        // Leave existing summary view in place on network error
      }
    }
  }

  async function refreshSharedHistory(showToastOnError, options) {
    if (state.refreshingHistory) return;
    const isManual = Boolean(options && options.manual !== undefined ? options.manual : showToastOnError);
    if (isManual) {
      state.refreshingHistory = true;
      state.historyRefreshError = null;
      update();
    }

    try {
      if (sharedStore) {
        const result = await sharedStore.loadHistory({ isVisitor: isVisitor() });
        state.history = sharedStore.getHistory();
        state.historySource = sharedStore.getHistorySource();
        state.historyStatus = sharedStore.getHistoryStatus();
        refreshSharedLeaderboard(false);
        if (result.ok) {
          state.lastFetched.history = Date.now();
          state.historyRefreshError = null;
          if (isManual) showToast("History refreshed");
        } else {
          state.historyRefreshError = "Shared history unavailable; showing local cache";
          if (showToastOnError) {
            showToast("Shared history unavailable; showing local cache");
          }
        }
        return;
      }

      const localGames = loadHistory();
      try {
        const response = await fetch(`${API_BASE}/get-history.php?limit=200&_=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: session.headers(),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok || !Array.isArray(payload.games)) {
          throw new Error(payload && payload.error ? payload.error : "Shared history API returned an error");
        }

        state.history = isVisitor() ? mergeHistoryGames(payload.games, localGames.filter(isVisitorGame)) : payload.games;
        state.historySource = "shared";
        state.historyStatus = isVisitor()
          ? `Showing ${state.history.length} permanent visitor match${state.history.length === 1 ? "" : "es"} from shared history.`
          : `Showing ${payload.games.length} shared match${payload.games.length === 1 ? "" : "es"}.`;
        state.lastFetched.history = Date.now();
        state.historyRefreshError = null;
        if (isManual) showToast("History refreshed");
        refreshSharedLeaderboard(false);
      } catch (error) {
        state.history = isVisitor()
          ? mergeHistoryGames(state.history, localGames.filter(isVisitorGame))
          : (state.history && state.history.length > 0 ? state.history : localGames);
        state.historySource = "local";
        state.historyStatus = isVisitor()
          ? `Shared database unavailable; showing ${state.history.length} local visitor match${state.history.length === 1 ? "" : "es"}.`
          : `Shared database unavailable; showing ${localGames.length} local cached match${localGames.length === 1 ? "" : "es"}.`;
        state.historyRefreshError = "Shared history unavailable; showing local cache";
        if (showToastOnError) {
          showToast("Shared history unavailable; showing local cache");
        }
      }
    } finally {
      if (isManual) {
        state.refreshingHistory = false;
      }
      update();
    }
  }

  async function refreshSharedLeaderboard(showToastOnError, options) {
    if (state.refreshingLeaderboard) return;
    const isManual = Boolean(options && options.manual !== undefined ? options.manual : showToastOnError);
    if (isManual) {
      state.refreshingLeaderboard = true;
      state.leaderboardRefreshError = null;
      update();
    }

    // Visitors' Leaderboard has no Events: Visitor Matches belong to none.
    const scope = isVisitor() ? "all" : state.leaderboardScope;
    try {
      const response = await fetch(`${API_BASE}/get-leaderboard.php?${scope === "current" ? "event=current&" : ""}_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: session.headers(),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Shared leaderboard API returned an error");
      }
      if (scope !== (isVisitor() ? "all" : state.leaderboardScope)) return;
      state.leaderboard = {
        event: payload.event || null,
        gamesCount: payload.gamesCount || 0,
        teamRows: Array.isArray(payload.teamRows) ? payload.teamRows : [],
        playerRows: Array.isArray(payload.playerRows) ? payload.playerRows : [],
      };
      state.lastFetched.leaderboard = Date.now();
      state.leaderboardRefreshError = null;
      if (isManual) showToast("Leaderboard refreshed");
    } catch (error) {
      state.leaderboardRefreshError = error.message || "Shared leaderboard unavailable";
      if (showToastOnError) {
        showToast("Shared leaderboard unavailable");
      }
    } finally {
      if (isManual) {
        state.refreshingLeaderboard = false;
      }
      update();
    }
  }

  async function postSharedGame(game) {
    if (!isStaff() && !isVisitor()) return;
    if (sharedStore) {
      const result = await sharedStore.saveGame(game, { isVisitor: isVisitor() });
      state.historySource = sharedStore.getHistorySource();
      state.historyStatus = sharedStore.getHistoryStatus();
      if (result.ok) {
        refreshSharedHistory(false);
      }
      showToast(result.toast);
      update();
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/save-game.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ game }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        const error = new Error(payload && payload.error ? payload.error : "Shared save failed");
        error.serverRefusal = true;
        throw error;
      }
      state.historySource = "shared";
      state.historyStatus = isVisitor() ? "Latest visitor match saved to shared history." : "Latest match saved to shared history.";
      refreshSharedHistory(false);
      showToast(isVisitor() ? "Match saved to visitor history" : "Match saved to shared history");
      update();
    } catch (error) {
      state.historySource = "local";
      state.historyStatus = isVisitor() ? "Latest visitor match saved locally only; shared database was unavailable." : "Latest match saved locally only; shared database was unavailable.";
      showToast(error.serverRefusal ? error.message : isVisitor() ? "Match saved locally; visitor shared history unavailable" : "Match saved locally; shared history unavailable");
      update();
    }
  }

  async function refreshSharedTournament(showToastOnError, options) {
    const silent = Boolean(options && options.silent);
    const isPoll = Boolean(options && options.isPoll);
    const isManual = !silent && !isPoll;

    if (isManual) {
      if (state.refreshingTournament) return;
      state.refreshingTournament = true;
      state.tournamentRefreshError = null;
      state.tournamentStatus = "Checking shared XAMPP tournament...";
      update();
    }

    try {
      if (sharedStore) {
        const result = isPoll
          ? await sharedStore.pollTournament(state.tournament && state.tournament.id)
          : await sharedStore.loadTournament(state.tournament && state.tournament.id, options);

        if (result.skipped || result.unchanged) {
          return;
        }

        state.tournament = sharedStore.getTournament();
        state.tournamentSource = sharedStore.getSource();
        state.tournamentStatus = sharedStore.getStatus();

        if (result.ok) {
          state.lastFetched.tournament = Date.now();
          state.tournamentRefreshError = null;
          if (isManual && showToastOnError) showToast("Tournament refreshed");
        } else {
          if (!silent) state.tournamentRefreshError = "Shared tournament unavailable";
          if (showToastOnError && !silent) showToast("Shared tournament unavailable");
        }
        return;
      }

      const localTournament = loadTournament();
      try {
        const response = await fetch(`${API_BASE}/get-tournament.php?id=${encodeURIComponent(state.tournament.id || defaultTournament.id)}&_=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: session.headers(),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload && payload.error ? payload.error : "Shared tournament API returned an error");
        }

        if (payload.tournament) {
          state.tournament = normalizeTournament(payload.tournament);
          state.tournamentSource = "shared";
          state.tournamentStatus = "Showing shared XAMPP Tournament.";
        } else {
          state.tournament = localTournament;
          state.tournamentSource = "local";
          state.tournamentStatus = "No shared tournament yet; showing this browser's local setup.";
        }
        state.lastFetched.tournament = Date.now();
        state.tournamentRefreshError = null;
        if (isManual && showToastOnError) showToast("Tournament refreshed");
      } catch (error) {
        if (!state.tournament || !state.tournament.matches) {
          state.tournament = localTournament;
        }
        state.tournamentSource = "local";
        state.tournamentStatus = "Shared tournament unavailable; showing local tournament.";
        if (!silent) state.tournamentRefreshError = "Shared tournament unavailable";
        if (showToastOnError && !silent) showToast("Shared tournament unavailable");
      }
    } finally {
      if (isManual) {
        state.refreshingTournament = false;
      }
      update();
    }
  }

  async function loadNetworkInfo() {
    if (sharedStore) {
      const result = await sharedStore.loadNetworkInfo({ fallbackUrl: sharePageUrl() });
      state.network = sharedStore.getNetworkInfo();
      update();
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/network-info.php?_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Network info unavailable");
      }

      const urls = Array.isArray(payload.urls) ? payload.urls.filter(Boolean) : [];
      state.network = {
        status: urls.length ? "LAN link ready for same Wi-Fi devices." : "Using the current browser link.",
        preferredUrl: payload.preferredUrl || urls[0] || sharePageUrl(),
        urls,
        hostname: payload.hostname || "",
        ips: Array.isArray(payload.ips) ? payload.ips : [],
      };
      update();
    } catch (error) {
      state.network = {
        status: "Could not detect LAN IP; using current browser link.",
        preferredUrl: sharePageUrl(),
        urls: [],
      };
      update();
    }
  }

  async function postSharedTournament(tournament, options) {
    const silent = Boolean(options && options.silent);
    const intent = options && options.intent ? String(options.intent) : "";

    if (sharedStore) {
      const result = await sharedStore.saveTournament(tournament, { intent, silent });
      state.tournament = sharedStore.getTournament();
      state.tournamentSource = sharedStore.getSource();
      state.tournamentStatus = sharedStore.getStatus();
      if (state.view === "tournament" || state.view === "live") update();
      if (!result.ok && !silent) showToast(result.error || "Tournament saved locally");
      return result.ok;
    }

    try {
      const response = await fetch(`${API_BASE}/save-tournament.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ tournament, intent }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Shared tournament save failed");
      }
      if (payload.tournament) {
        state.tournament = normalizeTournament(payload.tournament);
        saveTournament();
      }
      state.tournamentSource = "shared";
      state.tournamentStatus = "Tournament saved to shared XAMPP database.";
      if (state.view === "tournament" || state.view === "live") update();
      return true;
    } catch (error) {
      state.tournamentSource = "local";
      state.tournamentStatus = `Shared tournament save failed: ${error.message || "database unavailable"}.`;
      if (state.view === "tournament" || state.view === "live") update();
      if (!silent) showToast(error.message || "Tournament saved locally");
      return false;
    }
  }

  async function postSharedTournamentMatch(matchUpdate, options) {
    if (!isStaff()) return { ok: false, error: "Admin access required" };
    if (!matchUpdate) return { ok: false, error: "Missing match update payload" };
    const silent = Boolean(options && options.silent);
    const intent = options && options.intent ? String(options.intent) : "score-sync";

    if (sharedStore) {
      const result = await sharedStore.saveTournamentMatch(matchUpdate, { intent, silent });
      state.tournament = sharedStore.getTournament();
      state.tournamentSource = sharedStore.getSource();
      state.tournamentStatus = sharedStore.getStatus();
      if (state.view === "tournament" || state.view === "live") update();
      if (result.error === "Scoring moved to another device") retireScoringDevice();
      if (!result.ok && !silent && result.error !== "Scoring moved to another device") showToast(result.error || "Live match score could not be saved");
      return result;
    }

    try {
      const response = await fetch(`${API_BASE}/save-tournament-match.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ match: matchUpdate, intent }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Shared match update failed");
      }
      if (tournamentMatchModule && typeof tournamentMatchModule.applyServerMatch === "function") {
        const applied = tournamentMatchModule.applyServerMatch(state.tournament, payload);
        if (applied.ok && applied.tournament) {
          state.tournament = normalizeTournament(applied.tournament);
          saveTournament();
        }
      } else if (payload.tournament) {
        state.tournament = normalizeTournament(payload.tournament);
        saveTournament();
      }
      state.tournamentSource = "shared";
      state.tournamentStatus = "Live match score saved to shared XAMPP database.";
      if (state.view === "tournament" || state.view === "live") update();
      return { ok: true, tournament: state.tournament, match: payload.match };
    } catch (error) {
      if (error.message === "Scoring moved to another device") retireScoringDevice();
      state.tournamentSource = "local";
      state.tournamentStatus = `Shared match update failed: ${error.message || "database unavailable"}.`;
      if (state.view === "tournament" || state.view === "live") update();
      if (!silent && error.message !== "Scoring moved to another device") showToast(error.message || "Live match score could not be saved");
      return { ok: false, error: error.message || "Live match score could not be saved" };
    }
  }

  function retireScoringDevice() {
    state.currentGame = null;
    state.summaryGame = null;
    state.undoStack = [];
    state.view = "tournament";
    clearActiveGame();
    showToast("Scoring moved to another device");
    update();
  }

  function tournamentMatchUpdateFromGame(game, status) {
    if (!game || !game.tournamentMatch) return null;
    if (tournamentMatchModule && typeof tournamentMatchModule.buildMatchUpdate === "function") {
      const extra = status === "completed" ? {
        durationSeconds: gameDurationSeconds(game),
        durationMinutes: gameDurationMinutes(game),
      } : {
        switchEnds: isSwitchEndsRally(game),
      };
      const update = tournamentMatchModule.buildMatchUpdate(game, status, extra);
      if (update) {
        update.scoringClaim = game.scoringClaim || null;
        if (!update.tournamentId) update.tournamentId = state.tournament.id || defaultTournament.id;
        if (!update.startedBy) update.startedBy = currentUserSummary();
        return update;
      }
    }
    const updateStatus = status === "completed" ? "completed" : status === "scheduled" ? "scheduled" : "in_progress";
    const update = {
      tournamentId: game.tournamentMatch.tournamentId || state.tournament.id || defaultTournament.id,
      matchId: game.tournamentMatch.matchId,
      court: game.tournamentMatch.court,
      activeGameId: game.id,
      scoringClaim: game.scoringClaim || null,
      status: updateStatus,
      scoreA: String(game.teamA.score),
      scoreB: String(game.teamB.score),
      winner: null,
      completedAt: null,
      gameId: null,
      durationSeconds: null,
      durationMinutes: null,
      startedAt: game.startedAt || null,
      startedBy: game.createdBy || currentUserSummary(),
      liveEventCount: Array.isArray(game.events) ? game.events.length : 0,
    };

    if (updateStatus === "completed") {
      update.winner = game.winner === "A" || game.winner === "B" ? game.winner : null;
      update.completedAt = game.endedAt || new Date().toISOString();
      update.gameId = game.id;
      update.durationSeconds = gameDurationSeconds(game);
      update.durationMinutes = gameDurationMinutes(game);
      update.targetScore = game.targetScore;
      update.winByTwo = Boolean(game.winByTwo);
      update.endedEarly = Boolean(game.endedEarly);
      update.endReason = game.endReason || null;
      update.retiredTeam = game.retiredTeam === "A" || game.retiredTeam === "B" ? game.retiredTeam : null;
    }

    return update;
  }

  async function generateOpenPlayTournament() {
    if (!isSuperAdmin()) {
      showToast("Super Admin access required");
      return;
    }
    if (state.tournamentForm.pending) return;

    state.tournamentForm.failure = "";
    state.tournamentForm.success = "";

    const scheduler = window.OpenPlayScheduler;
    const errors = scheduler && scheduler.tournamentErrors
      ? scheduler.tournamentErrors(state.tournament)
      : {};
    state.tournamentForm.errors = errors;

    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      renderNowAndFocus(`[data-tournament-field="${firstInvalid}"]`);
      return;
    }

    state.tournamentForm.pending = true;
    renderNowAndFocus(null);
    const hasExistingSchedule = state.tournament.matches && state.tournament.matches.length > 0;
    showToast(hasExistingSchedule ? "Updating schedule…" : "Generating matches…");

    try {
      const players = scheduler && scheduler.parseTournamentPlayers
        ? scheduler.parseTournamentPlayers(state.tournament.playersText)
        : tournamentPlayers();
      const courts = Number(state.tournament.courts);
      const matchesPerPlayer = Number(state.tournament.matchesPerPlayer);
      const targetScore = Number(state.tournament.targetScore);
      const transitionMinutes = Number(state.tournament.transitionMinutes);
      const timing = tournamentFormatEstimate(players.length, state.tournament);
      const lockedMatches = state.tournament.matches.filter(
        (match) => match.status === "completed" || match.status === "in_progress"
      );
      // Skill levels are read now only, so a level changed mid-Event waits for the next Generate or Update.
      await fetchPlayers(false);
      const skillLevels = Object.fromEntries((state.players || []).filter((player) => player.skillLevel).map((player) => [player.name, player.skillLevel]));
      const matches = scheduler.buildOpenPlayMatches(players, courts, matchesPerPlayer, lockedMatches, undefined, skillLevels);
      state.tournament = normalizeTournament({
        ...state.tournament,
        courts,
        matchesPerPlayer,
        targetScore,
        averageGameMinutes: timing.averageGameMinutes,
        transitionMinutes,
        bufferMinutes: timing.bufferMinutes,
        timingVersion: defaultTournament.timingVersion,
        matches,
        generatedAt: new Date().toISOString(),
        seed: Date.now(),
      });
      saveTournament();
      const savedShared = await postSharedTournament(state.tournament, { intent: "schedule-update" });
      if (!savedShared) {
        state.tournamentForm.pending = false;
        state.tournamentForm.failure = state.tournamentStatus || "Failed to save tournament to shared server";
        showToast(state.tournamentForm.failure);
        renderNowAndFocus('[data-tournament-form] [type="submit"]');
        return;
      }
      state.tournamentForm.pending = false;
      const actionWord = lockedMatches.length ? "Updated" : "Generated";
      const message = `${actionWord} ${matches.length} open play matches`;
      showToast(message);
      update();
    } catch (error) {
      state.tournamentForm.pending = false;
      state.tournamentForm.failure = error.message || "Failed to generate open play schedule";
      showToast(state.tournamentForm.failure);
      renderNowAndFocus('[data-tournament-form] [type="submit"]');
    }
  }

  function resetTournament(trigger) {
    if (!isSuperAdmin()) {
      showToast("Super Admin access required");
      return;
    }
    const tournamentName = state.tournament.name || "Open Play";
    requestDestructiveConfirmation({
      title: `Reset ${tournamentName}?`,
      description: `Resetting ${tournamentName} removes every scheduled, ongoing, and completed Open Play Match, clears those Match results from History, and returns the event to empty setup.`,
      cancelLabel: "Keep Open Play",
      confirmLabel: "Reset Open Play",
    }, performTournamentReset, trigger);
  }

  async function performTournamentReset() {
    const tournamentId = state.tournament && state.tournament.id ? state.tournament.id : defaultTournament.id;
    clearLocalTournamentGames(tournamentId);
    state.tournament = { ...defaultTournament };
    state.tournamentForm = { ...defaultTournamentForm };
    saveTournament();
    await postSharedTournament(state.tournament, { intent: "reset" });
    await clearSharedTournamentGames(tournamentId);
    await refreshSharedHistory(false);
    update();
    showToast("Tournament reset and all Tournament Matches cleared");
  }

  function startNewEvent(trigger) {
    if (!isSuperAdmin()) {
      showToast("Super Admin access required");
      return;
    }
    if (state.startEventForm.pending) return;
    const name = state.startEventForm.name.trim();
    if (!name) {
      state.startEventForm.failure = "Event name is required";
      update();
      return;
    }

    const currentName = state.tournament.name || "Open Play";
    const matches = state.tournament.matches || [];
    const inProgress = matches.filter((match) => match.status === "in_progress").length;
    const notPlayed = matches.filter((match) => match.status === "scheduled").length;
    const unfinished = inProgress || notPlayed
      ? ` ${inProgress} ${inProgress === 1 ? "Match" : "Matches"} in progress and ${notPlayed} not played will stay unfinished in '${currentName}'.`
      : "";
    requestDestructiveConfirmation({
      title: `Start '${name}'?`,
      description: `'${currentName}' becomes a past Event and can't be scored or reopened. This can't be undone.${unfinished}`,
      cancelLabel: "Keep current Event",
      confirmLabel: "Start New Event",
    }, () => performStartNewEvent(name), trigger);
  }

  async function performStartNewEvent(name) {
    state.startEventForm.pending = true;
    state.startEventForm.failure = "";
    update();
    try {
      const response = await fetch(`${API_BASE}/start-event.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ name, courts: Number(state.startEventForm.courts) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Could not start the new Event");
      }
      defaultTournament.id = payload.currentEventId;
      state.tournament = payload.tournament;
      state.tournamentForm = { ...defaultTournamentForm };
      state.startEventForm = { ...defaultStartEventForm };
      state.rosterQuickAddName = "";
      saveTournament();
      showToast(`Started ${payload.tournament.name}`);
      update();
    } catch (error) {
      state.startEventForm.pending = false;
      state.startEventForm.failure = error.message || "Could not start the new Event";
      update();
    }
  }

  function clearLocalTournamentGames(tournamentId) {
    if (state.currentGame && isTournamentGame(state.currentGame, tournamentId)) {
      state.currentGame = null;
      state.recoveryPrompt = false;
      state.undoStack = [];
      clearActiveGame();
    }

    if (state.summaryGame && isTournamentGame(state.summaryGame, tournamentId)) {
      state.summaryGame = null;
    }

    state.history = state.history.filter((game) => !isTournamentGame(game, tournamentId));
    saveHistory();
  }

  async function clearSharedTournamentGames(tournamentId) {
    try {
      const response = await fetch(`${API_BASE}/reset-tournament-games.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ tournamentId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Shared Tournament Matches could not be cleared");
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function isTournamentGame(game, tournamentId) {
    if (!game || !game.tournamentMatch) return false;
    const gameTournamentId = String(game.tournamentMatch.tournamentId || "");
    return !tournamentId || gameTournamentId === String(tournamentId);
  }

  function clearTournamentResults(trigger) {
    if (!isSuperAdmin()) {
      showToast("Super Admin access required");
      return;
    }
    const tournamentName = state.tournament.name || "Open Play";
    requestDestructiveConfirmation({
      title: `Clear results for ${tournamentName}?`,
      description: `Clearing ${tournamentName} removes the saved result and score from every completed Match, keeps its schedule and players, and unlocks every Match to be played again.`,
      cancelLabel: "Keep Results",
      confirmLabel: "Clear Results",
    }, performClearTournamentResults, trigger);
  }

  function performClearTournamentResults() {
    state.tournamentForm.failure = "";
    state.tournament.matches = state.tournament.matches.map((match) => ({
      ...match,
      scoreA: "",
      scoreB: "",
      status: "scheduled",
      winner: null,
      completedAt: null,
      gameId: null,
      durationSeconds: null,
      durationMinutes: null,
      startedAt: null,
      startedBy: null,
      activeGameId: null,
    }));
    saveTournament();
    postSharedTournament(state.tournament, { intent: "clear-results" });
    update();
  }

  function buildLeaderboardStats(games) {
    const teamStats = new Map();
    const playerStats = new Map();
    let gamesCount = 0;

    games.forEach((game) => {
      if (!game || game.status !== "completed" || !game.winner || !game.teamA || !game.teamB) return;

      const winnerKey = game.winner === "B" ? "B" : "A";
      const loserKey = winnerKey === "A" ? "B" : "A";
      const winnerTeam = teamByKey(game, winnerKey);
      const loserTeam = teamByKey(game, loserKey);
      const winnerScore = Number(winnerTeam.score) || 0;
      const loserScore = Number(loserTeam.score) || 0;
      gamesCount += 1;

      recordLeaderboardResult(teamStats, teamLeaderboardKey(winnerTeam.name), winnerTeam.name, "team", true, winnerScore, loserScore, game);
      recordLeaderboardResult(teamStats, teamLeaderboardKey(loserTeam.name), loserTeam.name, "team", false, loserScore, winnerScore, game);

      playerNamesForLeaderboard(game, winnerKey).forEach((playerName) => {
        recordLeaderboardResult(playerStats, playerLeaderboardKey(playerName), playerName, "player", true, winnerScore, loserScore, game, winnerTeam.name);
      });
      playerNamesForLeaderboard(game, loserKey).forEach((playerName) => {
        recordLeaderboardResult(playerStats, playerLeaderboardKey(playerName), playerName, "player", false, loserScore, winnerScore, game, loserTeam.name);
      });
    });

    return {
      gamesCount,
      teamRows: sortLeaderboardRows(Array.from(teamStats.values())),
      playerRows: sortLeaderboardRows(Array.from(playerStats.values())),
    };
  }

  function recordLeaderboardResult(stats, key, name, type, won, pointsFor, pointsAgainst, game, teamNameValue) {
    if (!stats.has(key)) {
      stats.set(key, {
        key,
        name: cleanName(name, type === "team" ? "Unnamed Team" : "Unnamed Player"),
        type,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        minutesPlayed: 0,
        teams: new Set(),
      });
    }

    const row = stats.get(key);
    if (won) row.wins += 1;
    else row.losses += 1;
    row.pointsFor += pointsFor;
    row.pointsAgainst += pointsAgainst;
    row.minutesPlayed += gameDurationMinutes(game);
    if (teamNameValue) row.teams.add(teamNameValue);

    row.games = row.wins + row.losses;
    row.diff = row.pointsFor - row.pointsAgainst;
    row.winRate = row.games ? Math.round((row.wins / row.games) * 100) : 0;
    row.detail = row.teams && row.teams.size ? Array.from(row.teams).slice(0, 2).join(" / ") : "";
  }

  function sortLeaderboardRows(rows) {
    return rows
      .map((row) => ({
        ...row,
        detail: row.detail || "",
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (b.diff !== a.diff) return b.diff - a.diff;
        if ((b.minutesPlayed || 0) !== (a.minutesPlayed || 0)) return (b.minutesPlayed || 0) - (a.minutesPlayed || 0);
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return a.name.localeCompare(b.name);
      });
  }

  function gameDurationSeconds(game) {
    if (!game || !game.startedAt || !game.endedAt) return 0;
    const seconds = Math.round((new Date(game.endedAt).getTime() - new Date(game.startedAt).getTime()) / 1000);
    return Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  }

  function gameDurationMinutes(game) {
    const seconds = gameDurationSeconds(game);
    if (!seconds) return defaultTournament.averageGameMinutes;
    return Math.max(1, Math.round(seconds / 60));
  }

  function playerNamesForLeaderboard(game, key) {
    const team = teamByKey(game, key);
    const players = Array.isArray(team.players) ? team.players.map((name) => String(name || "").trim()).filter(Boolean) : [];
    if (game.type === "singles") return [players[0] || team.name];
    if (players.length) return players;
    return [`${team.name} Player 1`, `${team.name} Player 2`];
  }

  function teamLeaderboardKey(name) {
    return `team:${String(name || "").trim().toLowerCase()}`;
  }

  function playerLeaderboardKey(name) {
    return `player:${String(name || "").trim().toLowerCase()}`;
  }

  function tournamentPlayers() {
    if (window.OpenPlayScheduler && window.OpenPlayScheduler.parseTournamentPlayers) {
      return window.OpenPlayScheduler.parseTournamentPlayers(state.tournament.playersText);
    }
    const seen = new Set();
    return String(state.tournament.playersText || "")
      .split(/[\n,]+/)
      .map((name) => cleanName(name, ""))
      .filter(Boolean)
      .map((name) => name.slice(0, 32))
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function tournamentNumberFieldLimits(field) {
    const limits = {
      courts: { min: 1, max: 16, fallback: defaultTournament.courts },
      matchesPerPlayer: { min: 1, max: 30, fallback: defaultTournament.matchesPerPlayer },
      targetScore: { min: 1, max: 99, fallback: defaultTournament.targetScore },
      averageGameMinutes: { min: 5, max: 60, fallback: defaultTournament.averageGameMinutes },
      transitionMinutes: { min: 0, max: 20, fallback: defaultTournament.transitionMinutes },
      bufferMinutes: { min: 0, max: 120, fallback: defaultTournament.bufferMinutes },
    };
    return limits[field] || { min: 1, max: 99, fallback: 1 };
  }

  function tournamentFormatEstimate(playerCount, tournament) {
    const courts = clampNumber(Number(tournament.courts) || defaultTournament.courts, 1, 16);
    const matchesPerPlayer = clampNumber(Number(tournament.matchesPerPlayer) || defaultTournament.matchesPerPlayer, 1, 30);
    const averageGameMinutes = tournamentTimingNumber(tournament.averageGameMinutes, 15, 5, 60);
    const transitionMinutes = tournamentTimingNumber(tournament.transitionMinutes, 3, 0, 20);
    const bufferMinutes = tournamentTimingNumber(tournament.bufferMinutes, 30, 0, 120);
    const playersPerGame = 4;
    const activePlayers = courts * playersPerGame;
    const waitingPlayers = Math.max(0, playerCount - activePlayers);
    const gamesPerRotation = playerCount ? Math.ceil(playerCount / playersPerGame) : 0;
    const wavesPerRotation = gamesPerRotation ? Math.ceil(gamesPerRotation / courts) : 0;
    const waveMinutes = averageGameMinutes + transitionMinutes;
    const rotationMinutes = wavesPerRotation * waveMinutes;
    const totalPlayerSlots = playerCount * matchesPerPlayer;
    const totalGames = totalPlayerSlots ? Math.ceil(totalPlayerSlots / playersPerGame) : 0;
    const totalWaves = totalGames ? Math.ceil(totalGames / courts) : 0;
    const eventMinutes = totalWaves * waveMinutes;
    const playingMinutes = matchesPerPlayer * averageGameMinutes;
    const bookingMinutes = eventMinutes + bufferMinutes;

    return {
      playerCount,
      playersPerGame,
      courts,
      matchesPerPlayer,
      averageGameMinutes,
      transitionMinutes,
      bufferMinutes,
      activePlayers,
      waitingPlayers,
      gamesPerRotation,
      wavesPerRotation,
      waveMinutes,
      totalGames,
      totalWaves,
      eventTimeLabel: formatMinutes(eventMinutes),
      rotationTimeLabel: formatMinutes(rotationMinutes),
      playingTimeLabel: formatMinutes(playingMinutes),
      bookingTimeLabel: formatMinutes(bookingMinutes),
    };
  }

  function tournamentTimingNumber(value, fallback, min, max) {
    if (value === "" || value === null || value === undefined) return fallback;
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return clampNumber(number, min, max);
  }

  function formatMinutes(minutes) {
    const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
    if (safeMinutes < 60) return `${safeMinutes} min`;
    const hours = Math.floor(safeMinutes / 60);
    const remainder = safeMinutes % 60;
    if (!remainder) return `${hours} hour${hours === 1 ? "" : "s"}`;
    return `${hours}h ${remainder}m`;
  }

  function buildTournamentStats(tournament) {
    const rowsByPlayer = new Map();
    const players = tournamentPlayers();
    let completedMatches = 0;

    players.forEach((player) => {
      rowsByPlayer.set(playerLeaderboardKey(player), {
        name: player,
        games: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        minutesPlayed: 0,
        diff: 0,
        winRate: 0,
        detail: "No results yet",
      });
    });

    tournament.matches.forEach((sourceMatch) => {
      const match = normalizeTournamentMatchResult({ ...sourceMatch });
      if (match.status !== "completed") return;
      completedMatches += 1;

      const scoreA = Number(match.scoreA);
      const scoreB = Number(match.scoreB);
      const matchMinutes = tournamentMatchMinutes(match, tournament);
      recordTournamentTeamPlayers(rowsByPlayer, match.teamA, match.winner === "A", scoreA, scoreB, matchMinutes);
      recordTournamentTeamPlayers(rowsByPlayer, match.teamB, match.winner === "B", scoreB, scoreA, matchMinutes);
    });

    rowsByPlayer.forEach((row) => {
      row.diff = row.pointsFor - row.pointsAgainst;
      row.winRate = row.games ? Math.round((row.wins / row.games) * 100) : 0;
      row.detail = row.games ? `${row.games} match${row.games === 1 ? "" : "es"}, ${row.minutesPlayed || 0} min played` : "No results yet";
    });

    return {
      completedMatches,
      rows: sortLeaderboardRows(Array.from(rowsByPlayer.values())),
    };
  }

  function recordTournamentTeamPlayers(rowsByPlayer, players, won, pointsFor, pointsAgainst, minutesPlayed) {
    players.forEach((player) => {
      const key = playerLeaderboardKey(player);
      if (!rowsByPlayer.has(key)) {
        rowsByPlayer.set(key, {
          name: player,
          games: 0,
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          minutesPlayed: 0,
          diff: 0,
          winRate: 0,
          detail: "",
        });
      }

      const row = rowsByPlayer.get(key);
      row.games += 1;
      if (won) row.wins += 1;
      else row.losses += 1;
      row.pointsFor += pointsFor;
      row.pointsAgainst += pointsAgainst;
      row.minutesPlayed += minutesPlayed;
    });
  }

  function tournamentMatchMinutes(match, tournament) {
    const storedMinutes = Number(match.durationMinutes);
    if (Number.isFinite(storedMinutes) && storedMinutes > 0) return Math.round(storedMinutes);

    const storedSeconds = Number(match.durationSeconds);
    if (Number.isFinite(storedSeconds) && storedSeconds > 0) return Math.max(1, Math.round(storedSeconds / 60));

    return tournamentTimingNumber(tournament.averageGameMinutes, defaultTournament.averageGameMinutes, 5, 60);
  }

  function normalizeTournamentMatchResult(match) {
    match.scoreA = String(match.scoreA || "").replace(/\D/g, "").slice(0, 2);
    match.scoreB = String(match.scoreB || "").replace(/\D/g, "").slice(0, 2);
    match.startedAt = match.startedAt || null;
    match.startedBy = match.startedBy && typeof match.startedBy === "object" ? match.startedBy : null;
    match.activeGameId = match.activeGameId || null;

    if (match.status === "in_progress") {
      match.winner = null;
      match.completedAt = null;
      match.gameId = null;
      match.durationSeconds = null;
      match.durationMinutes = null;
      return match;
    }

    const hasWinner = match.winner === "A" || match.winner === "B";
    if (match.status === "completed" && match.scoreA !== "" && match.scoreB !== "" && (hasWinner || Number(match.scoreA) !== Number(match.scoreB))) {
      match.winner = match.winner === "A" || match.winner === "B" ? match.winner : Number(match.scoreA) > Number(match.scoreB) ? "A" : "B";
      match.activeGameId = null;
      return match;
    }

    match.status = "scheduled";
    match.winner = null;
    match.completedAt = null;
    match.gameId = null;
    match.durationSeconds = null;
    match.durationMinutes = null;
    match.startedAt = null;
    match.startedBy = null;
    match.activeGameId = null;
    return match;
  }

  function tournamentCoverage(players, matches) {
    const totalPairs = allPlayerPairs(players).length;
    const covered = new Set();
    const activePlayers = new Set(players);
    matches.forEach((match) => {
      pairsForGroup(matchPlayers(match).filter((player) => activePlayers.has(player))).forEach((pair) => covered.add(pair));
    });
    return {
      totalPairs,
      coveredPairs: Math.min(covered.size, totalPairs),
    };
  }

  function tournamentSlotCoverage(players, matches, matchesPerPlayer) {
    const activePlayers = new Set(players);
    const targetSlots = players.length * clampNumber(matchesPerPlayer, 1, 30);
    let scheduledSlots = 0;

    matches.forEach((match) => {
      scheduledSlots += matchPlayers(match).filter((player) => activePlayers.has(player)).length;
    });

    return {
      targetSlots,
      scheduledSlots,
    };
  }

  function groupMatchesByRound(matches) {
    const grouped = new Map();
    matches.forEach((match) => {
      const round = match.round || 1;
      if (!grouped.has(round)) grouped.set(round, []);
      grouped.get(round).push(match);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, roundMatches]) => ({
        round,
        matches: roundMatches.slice().sort((a, b) => a.court - b.court),
      }));
  }

  function matchPlayers(match) {
    return [...match.teamA, ...match.teamB];
  }

  function allPlayerPairs(players) {
    return pairsForGroup(players);
  }

  function pairsForGroup(group) {
    const pairs = [];
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        pairs.push(pairKey(group[i], group[j]));
      }
    }
    return pairs;
  }

  function pairKey(first, second) {
    return [first, second].map((value) => String(value).toLowerCase()).sort().join("::");
  }

  async function bootstrapSession() {
    if (!session.isSignedIn()) {
      const hadIdentity = session.hasRememberedIdentity ? session.hasRememberedIdentity() : false;
      if (!(await recoverPasswordlessAuth())) {
        state.sessionRestoring = false;
        state.view = "login";
        if (hadIdentity) {
          showToast("Could not restore saved session. Please sign in again.");
        }
        update();
        return;
      }
      return;
    }

    await hydrateAuth();
    if (!session.isSignedIn()) {
      state.sessionRestoring = false;
      return;
    }

    state.sessionRestoring = false;
    resolveAndSyncUrlView(state.view);

    clearUnavailableActiveGameForRole();
    applyCurrentUserToSetup();
    if (isStaff()) {
      fetchUserCounts();
      fetchQlikReloadTime();
      fetchPlayers(false);
    }
    refreshSharedHistory(false);
    refreshSharedTournament(false);
    loadNetworkInfo();
    if (isSuperAdmin()) fetchUsers(false);
    update();
  }

  async function hydrateAuth() {
    if (!session.isSignedIn()) return;
    try {
      const response = await fetch(`${API_BASE}/auth.php?action=me&_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: session.headers(),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !payload.user) {
        if (await recoverPasswordlessAuth()) return;
        session.clear();
        setLoginPortalState(session.portal());
        state.authForm.failure = "Your session ended. Sign in again.";
        state.sessionRestoring = false;
        state.view = "login";
        showToast("Your session has expired. Please sign in again.");
        update();
        return;
      }
      if (!session.updateUser(payload.user, payload.permissions)) {
        setLoginPortalState(session.portal());
        state.authForm.failure = "Your session ended. Sign in again.";
        state.sessionRestoring = false;
        state.view = "login";
        showToast("Your session has expired. Please sign in again.");
        update();
        return;
      }
      applyCurrentEventId(payload.currentEventId);
    } catch (error) {
      showToast("Could not verify login; using saved session");
    }
  }

  function isStaff() {
    return viewAccess.isStaff(session.permissions());
  }

  function isSuperAdmin() {
    return viewAccess.isSuperAdmin(session.permissions());
  }

  function isPlayer() {
    return viewAccess.isPlayer(session.permissions());
  }

  function isVisitor() {
    return viewAccess.isVisitor(session.permissions());
  }

  function canUseStandaloneSetup() {
    return viewAccess.canUseStandaloneSetup(session.permissions());
  }

  function toggleMobileNav() {
    if (isCompactViewport()) {
      state.mobileNavOpen = !state.mobileNavOpen;
    } else {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      state.mobileNavOpen = false;
    }
    update();
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    state.mobileNavOpen = false;
    update();
  }

  function requireMatchControlAccess() {
    if (isStaff() || isVisitor()) return true;
    denyMatchControl();
    return false;
  }

  function denyMatchControl() {
    state.recoveryPrompt = false;
    state.liveScoreExpanded = false;
    state.liveScoreFocusId = "";
    if (state.view === "scoreboard" || state.view === "setup") {
      state.view = "home";
      update();
    }
    showToast("This account can view matches only");
  }

  function setAuthMode(mode) {
    state.authForm.mode = mode === "register" ? "register" : "login";
    update();
  }

  function setLoginPortal(portal) {
    setLoginPortalState(session.switchPortal(portal));
    update();
  }

  function setLoginPortalState(portal) {
    const nextPortal = portal === "visitor" ? "visitor" : portal === "player" ? "player" : "admin";
    state.authForm.portal = nextPortal;
    state.authForm.errors = {};
    state.authForm.failure = "";
    state.authForm.password = "";
    if (nextPortal !== "visitor") {
      state.authForm.visitorName = "";
    }
    const currentUsername = String(state.authForm.username || "");
    if (nextPortal !== "admin" && currentUsername.toLowerCase() === DEFAULT_SUPER_ADMIN_LOGIN.toLowerCase()) {
      state.authForm.username = "";
    }
    if (nextPortal !== "visitor" && isValidEmail(currentUsername)) {
      state.authForm.username = "";
    }
    if (nextPortal === "visitor" && !isValidEmail(currentUsername)) {
      state.authForm.username = "";
    }
    return nextPortal;
  }

  function updateAuthForm(field, value) {
    if (!(field in state.authForm)) return;
    state.authForm[field] = String(value || "").slice(0, 120);
  }

  function updateProfileForm(field, value) {
    if (!(field in state.profileForm)) return;
    state.profileForm[field] = String(value || "").slice(0, field === "password" ? 128 : 120);
    state.profileForm.failure = "";
    state.profileForm.success = "";
  }

  function updateNewUserForm(field, value) {
    if (!(field in state.newUserForm)) return;
    if (field === "role") {
      state.newUserForm.role = value === "admin" ? "admin" : "player";
      if (state.newUserForm.role === "player") {
        state.newUserForm.password = "";
        if (state.newUserForm.errors && state.newUserForm.errors.password) {
          delete state.newUserForm.errors.password;
        }
      }
      state.newUserForm.failure = "";
      state.newUserForm.success = "";
      update();
      return;
    }
    state.newUserForm[field] = String(value || "").slice(0, 120);
    state.newUserForm.failure = "";
    state.newUserForm.success = "";
  }

  function updateTournamentPlayerForm(field, value) {
    if (!(field in state.tournamentPlayerForm)) return;
    state.tournamentPlayerForm[field] = String(value || "").slice(0, 120);
  }

  async function loginUser() {
    const form = state.authForm;
    if (form.pending) return;
    const username = form.username.trim();
    const isPlayerPortal = form.portal === "player";
    const isVisitorPortal = form.portal === "visitor";
    const password = isPlayerPortal || isVisitorPortal ? "" : form.password;
    form.errors = window.PaddlePointSession.signInErrors(form.portal, { username, password });
    form.failure = "";
    const firstInvalid = Object.keys(form.errors)[0];
    if (firstInvalid) {
      renderNowAndFocus(`[data-auth-field="${firstInvalid}"]`);
      return;
    }

    form.pending = true;
    renderNowAndFocus(null);
    showToast("Signing in…");
    try {
      const payload = isVisitorPortal
        ? await postAuth("visitor-login", { email: username, displayName: form.visitorName })
        : await postAuth("login", { username, password });
      form.pending = false;
      await acceptSignIn(payload);
      state.authForm.password = "";
      showToast(`Welcome, ${payload.user.displayName}`);
    } catch (error) {
      // Typed values stay in state, so the re-rendered form keeps them for another try.
      form.pending = false;
      form.failure = error.message || "Sign-in failed";
      showToast(form.failure);
      renderNowAndFocus('[data-auth-form] [type="submit"]');
    }
  }

  function renderNowAndFocus(selector, fallbackSelector) {
    update();
    if (renderScheduler) renderScheduler.flush();
    const target = selector ? app.querySelector(selector) : null;
    if (target && typeof target.focus === "function") {
      target.focus();
      return;
    }
    if (fallbackSelector) {
      const fallback = app.querySelector(fallbackSelector);
      if (fallback && typeof fallback.focus === "function") {
        fallback.focus();
      }
    }
  }

  async function registerPlayer() {
    const username = state.authForm.registerUsername.trim();
    const displayName = state.authForm.registerDisplayName.trim();
    const password = state.authForm.registerPassword;
    if (!username || !password) {
      showToast("Username and password are required");
      return;
    }

    try {
      const payload = await postAuth("register", { username, displayName, password });
      await acceptSignIn(payload);
      state.authForm.registerPassword = "";
      showToast(`Player account created for ${payload.user.displayName}`);
    } catch (error) {
      showToast(error.message || "Could not create player");
    }
  }

  async function logoutUser() {
    if (window.PaddlePointQlikMashup) window.PaddlePointQlikMashup.close();
    setLoginPortalState(await session.signOut());
    state.recoveryPrompt = false;
    state.mobileNavOpen = false;
    state.view = "login";
    state.users = [];
    if (viewAccess && typeof viewAccess.buildViewUrl === "function" && window.location && window.history) {
      try {
        window.history.replaceState({}, "", viewAccess.buildViewUrl(window.location.href, ""));
      } catch (e) {}
    }
    update();
  }

  async function saveProfile() {
    const user = session.user();
    if (!user) return;
    const form = state.profileForm;
    if (form.pending) return;

    const canHavePassword = Boolean(session.permissions() && session.permissions().have_password) || isStaff();
    const displayName = form.displayName !== undefined && form.displayName !== "" ? form.displayName : user.displayName;
    form.displayName = displayName;
    form.errors = window.PaddlePointSession.profileErrors(form, { canHavePassword });
    form.failure = "";
    form.success = "";

    const firstInvalid = Object.keys(form.errors)[0];
    if (firstInvalid) {
      renderNowAndFocus(`[data-profile-field="${firstInvalid}"]`);
      return;
    }

    const cleanDisplayName = cleanName(form.displayName, user.displayName);
    const password = form.password;

    form.pending = true;
    renderNowAndFocus(null);
    showToast("Saving profile…");

    try {
      const payload = await postAuth("profile", { displayName: cleanDisplayName, password }, session.headers());
      session.updateUser(payload.user);
      form.pending = false;
      form.displayName = payload.user.displayName;
      form.password = "";
      form.errors = {};
      form.failure = "";
      form.success = "Profile saved";
      applyCurrentUserToSetup();
      showToast("Profile saved");
      renderNowAndFocus('[data-profile-form] [type="submit"]');
    } catch (error) {
      form.pending = false;
      form.success = "";
      const msg = error.message || "Profile could not be saved";
      if (msg.toLowerCase().includes("display name")) {
        form.errors = { displayName: msg };
        renderNowAndFocus('[data-profile-field="displayName"]');
      } else if (msg.toLowerCase().includes("password")) {
        form.errors = { password: msg };
        renderNowAndFocus('[data-profile-field="password"]');
      } else {
        form.failure = msg;
        renderNowAndFocus('[data-profile-form] [type="submit"]');
      }
      showToast(msg);
    }
  }

  function setAnalyticsSheet(sheetId) {
    if (state.activeAnalyticsSheet === sheetId) return;
    state.activeAnalyticsSheet = sheetId;
    update();
  }

  async function fetchUserCounts() {
    if (!isStaff() || state.loadingUserCounts) return;
    try {
      state.loadingUserCounts = true;
      const response = await fetch("api/user-counts.php", {
        headers: session.headers(),
      });
      const payload = await response.json();
      if (response.ok && payload.ok) {
        state.userCounts = payload.counts;
        update();
      }
    } catch (e) {
      // Non-critical fallback
    } finally {
      state.loadingUserCounts = false;
    }
  }

  async function fetchEmbedToken() {
    const response = await fetch("api/qlik/get-embed-token.php", {
      method: "GET",
      cache: "no-store",
      headers: session.headers(),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      const err = new Error(payload.error || "Could not get a Qlik token");
      err.status = response.status;
      throw err;
    }
    return payload;
  }

  window.getPaddlePointQlikToken = async function () {
    const payload = await fetchEmbedToken();
    return payload.accessToken;
  };

  // The Current Event, for the Analytics Event filter's shortcut. Asks the server every time:
  // this browser's copy is stale when a Super Admin started a new Event elsewhere.
  window.getPaddlePointCurrentEvent = async function () {
    const response = await fetch(`${API_BASE}/get-tournament.php?_=${Date.now()}`, { cache: "no-store", headers: session.headers() });
    const payload = await response.json();
    return payload.ok && payload.tournament ? { id: payload.tournament.id, name: payload.tournament.name } : null;
  };

  async function fetchQlikReloadTime() {
    if (!isStaff()) return;
    try {
      const tokenPayload = await fetchEmbedToken();
      const response = await fetch(`${QLIK_HOST}/api/v1/apps/${QLIK_APP_ID}`, {
        headers: { Authorization: `Bearer ${tokenPayload.accessToken}` },
      });
      if (response.ok) {
        const appData = await response.json();
        const utc = new Date(appData.attributes.lastReloadTime);
        const manila = new Date(utc.getTime() + 8 * 60 * 60 * 1000);
        const reloadTime = manila.toISOString().replace("T", " ").slice(0, 19) + " PHT";
        // Re-render only when a reload landed; the periodic re-read must not redraw the page.
        if (reloadTime === state.qlikReloadTime) return;
        state.qlikReloadTime = reloadTime;
        state.qlikReloadedAt = utc.getTime();
        update();
      }
    } catch (e) {}
  }

  async function fetchUsers(showToastOnError, options) {
    if (!isSuperAdmin()) return;
    if (state.refreshingUsers) return;
    const isManual = Boolean(options && options.manual !== undefined ? options.manual : showToastOnError);
    if (isManual) {
      state.refreshingUsers = true;
      state.usersRefreshError = null;
      update();
    }

    try {
      if (sharedStore) {
        const result = await sharedStore.loadUsers();
        state.users = sharedStore.getUsers();
        state.usersStatus = sharedStore.getUsersStatus();
        if (result.ok) {
          state.lastFetched.users = Date.now();
          state.usersRefreshError = null;
          if (isManual) showToast("Users refreshed");
        } else {
          state.usersRefreshError = state.usersStatus || "Users unavailable";
          if (showToastOnError) showToast(state.usersStatus);
        }
        return;
      }

      const response = await fetch(`${API_BASE}/auth.php?action=users&_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: session.headers(),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !Array.isArray(payload.users)) {
        throw new Error(payload && payload.error ? payload.error : "Users could not be loaded");
      }
      state.users = payload.users;
      state.usersStatus = `Showing ${payload.users.length} user${payload.users.length === 1 ? "" : "s"}.`;
      state.lastFetched.users = Date.now();
      state.usersRefreshError = null;
      if (isManual) showToast("Users refreshed");
    } catch (error) {
      state.usersStatus = error.message || "Users unavailable";
      state.usersRefreshError = state.usersStatus;
      if (showToastOnError) showToast(state.usersStatus);
    } finally {
      if (isManual) {
        state.refreshingUsers = false;
      }
      update();
    }
  }

  async function fetchPlayers(showToastOnError, options) {
    if (!isStaff()) return;
    if (state.refreshingPlayers) return;
    const isManual = Boolean(options && options.manual !== undefined ? options.manual : showToastOnError);
    if (isManual) {
      state.refreshingPlayers = true;
      state.playersRefreshError = null;
      update();
    }

    try {
      const response = await fetch(`${API_BASE}/get-players.php?_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: session.headers(),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok || !Array.isArray(payload.players)) {
        throw new Error(payload && payload.error ? payload.error : "Players could not be loaded");
      }
      state.players = payload.players;
      state.playersStatus = `Showing ${payload.players.length} Player${payload.players.length === 1 ? "" : "s"}.`;
      state.lastFetched.players = Date.now();
      state.playersRefreshError = null;
      if (isManual) showToast("Players refreshed");
    } catch (error) {
      state.playersStatus = error.message || "Players unavailable";
      state.playersRefreshError = state.playersStatus;
      if (showToastOnError) showToast(state.playersStatus);
    } finally {
      if (isManual) {
        state.refreshingPlayers = false;
      }
      update();
    }
  }

  async function createUser() {
    if (!isSuperAdmin()) return;
    const form = state.newUserForm;
    if (form.pending) return;

    form.errors = window.PaddlePointSession.newUserErrors(form);
    form.failure = "";
    form.success = "";

    const firstInvalid = Object.keys(form.errors)[0];
    if (firstInvalid) {
      renderNowAndFocus(`[data-user-field="${firstInvalid}"]`);
      return;
    }

    form.pending = true;
    renderNowAndFocus(null);
    showToast("Adding user…");

    try {
      const payload = await postAuth(
        "create-user",
        {
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          password: form.role === "admin" ? form.password : "",
          role: form.role,
        },
        session.headers()
      );
      const createdUser = payload && payload.user ? payload.user : null;
      const createdName = (createdUser && (createdUser.displayName || createdUser.username)) || form.displayName || form.username;
      state.newUserForm = {
        ...defaultNewUserForm,
        role: form.role,
        success: `User created: ${createdName}`,
      };
      await fetchUsers(false);
      showToast(`User created: ${createdName}`);
      renderNowAndFocus('[data-new-user-form] [type="submit"]');
    } catch (error) {
      form.pending = false;
      form.success = "";
      const msg = error.message || "User could not be created";
      if (msg.toLowerCase().includes("username") || msg.toLowerCase().includes("taken")) {
        form.errors = { username: msg };
        renderNowAndFocus('[data-user-field="username"]');
      } else if (msg.toLowerCase().includes("password")) {
        form.errors = { password: msg };
        renderNowAndFocus('[data-user-field="password"]');
      } else {
        form.failure = msg;
        renderNowAndFocus('[data-new-user-form] [type="submit"]');
      }
      showToast(msg);
    }
  }

  async function createTournamentPlayer() {
    if (!isSuperAdmin()) return;
    const form = state.tournamentPlayerForm;
    const username = form.username.trim();
    const displayName = cleanName(form.displayName, username);
    if (!username) {
      showToast("Enter a unique player username");
      return;
    }

    try {
      const payload = await postAuth(
        "create-user",
        {
          username,
          displayName,
          password: "",
          role: "player",
        },
        session.headers()
      );
      const playerName = payload.user && payload.user.displayName ? payload.user.displayName : displayName;
      const addedToTournament = addRegisteredPlayerName(playerName);
      state.tournamentPlayerForm = { ...defaultTournamentPlayerForm };
      saveTournament();
      await postSharedTournament(state.tournament, { intent: "schedule-update" });
      await fetchUsers(false);
      showToast(addedToTournament ? `${playerName} created and added to tournament` : `${playerName} created; already in registered players`);
      update();
    } catch (error) {
      showToast(error.message || "Player could not be created");
    }
  }

  function addRegisteredPlayerName(name) {
    const cleanPlayerName = cleanName(name, "");
    if (!cleanPlayerName) return false;

    const existing = tournamentPlayers();
    const exists = existing.some((player) => sameName(player, cleanPlayerName));
    if (exists) return false;

    state.tournament = normalizeTournament({
      ...state.tournament,
      playersText: [...existing, cleanPlayerName].join("\n"),
    });
    return true;
  }

  // Adds the name typed (or picked from the existing-Players suggestions) into the roster's quick-add
  // field to the Tournament roster. The name is only added to playersText; saving the Tournament links
  // or creates its Player, the same as retyping the name directly would (ticket 01).
  function addRosterPlayerFromQuickAdd() {
    if (!isSuperAdmin()) return;
    const cleanPlayerName = cleanName(state.rosterQuickAddName, "");
    const added = addRegisteredPlayerName(cleanPlayerName);
    state.rosterQuickAddName = "";
    if (!added && cleanPlayerName) {
      showToast(`${cleanPlayerName} is already in registered players`);
    }
    renderNowAndFocus("[data-roster-quick-add]");
  }

  function startRenamePlayer(playerId) {
    if (!isStaff()) return;
    const player = state.players.find((item) => String(item.id) === String(playerId));
    if (!player) return;
    state.renamePlayerForm = { id: player.id, name: player.name, pending: false, failure: "" };
    renderNowAndFocus("[data-rename-player-field]");
  }

  function cancelRenamePlayer() {
    state.renamePlayerForm = null;
    update();
  }

  async function saveRenamePlayer() {
    if (!isStaff()) return;
    const form = state.renamePlayerForm;
    if (!form || form.pending) return;
    const name = cleanName(form.name, "");
    if (!name) {
      form.failure = "Name is required";
      renderNowAndFocus("[data-rename-player-field]");
      return;
    }

    form.pending = true;
    form.failure = "";
    update();
    try {
      const response = await fetch(`${API_BASE}/rename-player.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ id: form.id, name }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Player could not be renamed");
      }
      const renamed = payload.player;
      state.players = state.players.map((player) => (player.id === renamed.id ? { ...player, name: renamed.name } : player));
      state.renamePlayerForm = null;
      showToast(`Renamed to ${renamed.name}`);
      refreshSharedHistory(false);
      refreshSharedLeaderboard(false);
      refreshSharedTournament(false, { silent: true });
      update();
    } catch (error) {
      form.pending = false;
      form.failure = error.message || "Player could not be renamed";
      renderNowAndFocus("[data-rename-player-field]");
    }
  }

  async function setPlayerSkill(playerId, skillLevel) {
    if (!isStaff()) return;
    const player = state.players.find((item) => String(item.id) === String(playerId));
    if (!player) return;
    const cleanLevel = skillLevel ? String(skillLevel).toLowerCase().trim() : null;
    const currentLevel = player.skillLevel || null;
    if (cleanLevel === currentLevel) return;

    try {
      const response = await fetch(`${API_BASE}/set-player-skill.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ id: Number(playerId), skillLevel: cleanLevel }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Skill level could not be saved");
      }
      const updated = payload.player;
      state.players = state.players.map((item) =>
        item.id === updated.id ? { ...item, skillLevel: updated.skillLevel } : item
      );
      const label = formatSkillLevel(updated.skillLevel);
      showToast(`${player.name} set to ${label}`);
      update();
    } catch (error) {
      showToast(error.message || "Skill level could not be saved", "error");
      update();
    }
  }

  function startMergePlayer(playerId) {
    if (!isStaff()) return;
    const player = state.players.find((item) => String(item.id) === String(playerId));
    if (!player) return;
    const candidates = state.players.filter((item) => item.id !== player.id);
    const survivorId = candidates[0] ? candidates[0].id : null;
    state.renamePlayerForm = null;
    state.mergePlayerForm = { absorbedId: player.id, survivorId, pending: false, failure: "" };
    renderNowAndFocus("[data-merge-survivor-select]");
  }

  function cancelMergePlayer() {
    state.mergePlayerForm = null;
    update();
  }

  function confirmMergePlayer(trigger) {
    if (!isStaff()) return;
    const form = state.mergePlayerForm;
    if (!form || form.pending) return;
    const absorbed = state.players.find((p) => p.id === form.absorbedId);
    const survivor = state.players.find((p) => p.id === Number(form.survivorId));
    if (!absorbed || !survivor) {
      form.failure = "Please select a Player to merge into";
      renderNowAndFocus("[data-merge-survivor-select]");
      return;
    }

    if (absorbed.hasAccount && survivor.hasAccount) {
      form.failure = "Both Players have linked accounts. Unlink one first.";
      renderNowAndFocus("[data-merge-survivor-select]");
      return;
    }

    requestDestructiveConfirmation({
      title: `Merge ${absorbed.name} into ${survivor.name}?`,
      description: `Every Match of ${absorbed.name} will belong to ${survivor.name}, and ${absorbed.name} will be removed. This cannot be undone.`,
      cancelLabel: "Cancel",
      confirmLabel: "Merge Players",
    }, () => executeMergePlayers(), trigger);
  }

  async function executeMergePlayers() {
    if (!isStaff()) return;
    const form = state.mergePlayerForm;
    if (!form || form.pending) return;
    const absorbedId = form.absorbedId;
    const survivorId = Number(form.survivorId);

    form.pending = true;
    form.failure = "";
    update();

    try {
      const response = await fetch(`${API_BASE}/merge-players.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...session.headers() },
        body: JSON.stringify({ survivorId, absorbedId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload && payload.error ? payload.error : "Players could not be merged");
      }

      const survivor = payload.survivor;
      const absorbed = payload.absorbed;

      state.players = state.players
        .filter((p) => p.id !== absorbedId)
        .map((p) => (p.id === survivorId ? { ...p, skillLevel: survivor.skillLevel } : p));

      state.mergePlayerForm = null;
      showToast(`Merged ${absorbed ? absorbed.name : "Player"} into ${survivor.name}`);
      fetchPlayers(false);
      refreshSharedHistory(false);
      refreshSharedLeaderboard(false);
      refreshSharedTournament(false, { silent: true });
      update();
    } catch (error) {
      form.pending = false;
      form.failure = error.message || "Players could not be merged";
      renderNowAndFocus("[data-merge-survivor-select]");
    }
  }

  async function toggleUserActive(userId) {
    if (!isSuperAdmin()) return;
    const user = state.users.find((item) => String(item.id) === String(userId));
    if (!user) return;
    try {
      await postAuth(
        "update-user",
        {
          id: user.id,
          displayName: user.displayName,
          role: user.role,
          isActive: !user.isActive,
          password: "",
        },
        session.headers()
      );
      await fetchUsers(false);
      showToast(user.isActive ? "User deactivated" : "User activated");
    } catch (error) {
      showToast(error.message || "User could not be updated");
    }
  }

  function deleteUser(userId, trigger) {
    if (!isSuperAdmin()) return;
    const user = state.users.find((item) => String(item.id) === String(userId));
    if (!user || user.role === "super_admin") return;
    const accountName = user.displayName || user.username;
    requestDestructiveConfirmation({
      title: `Delete ${accountName}?`,
      description: `The ${roleLabel(user.role)} account ${user.username} will be permanently removed. This cannot be undone.`,
      cancelLabel: "Keep Account",
      confirmLabel: "Delete Account",
    }, async () => {
      try {
        await postAuth("delete-user", { id: user.id }, session.headers());
        await fetchUsers(false);
        showToast("User deleted");
      } catch (error) {
        showToast(error.message || "User could not be deleted");
      }
    }, trigger);
  }

  async function postAuth(action, body, headers = {}) {
    const response = await fetch(`${API_BASE}/auth.php?action=${encodeURIComponent(action)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload && payload.error ? payload.error : "Request failed");
    }
    return payload;
  }

  async function recoverPasswordlessAuth() {
    if (!(await session.recover())) return false;
    await hydrateAuth();
    await showSignedInApp();
    return true;
  }

  // A sign-in reply for a user who doesn't belong to this portal leaves them on the sign-in page.
  async function acceptSignIn(payload) {
    if (!session.signIn(payload)) {
      setLoginPortalState(session.portal());
      state.view = "login";
      update();
      return;
    }
    applyCurrentEventId(payload.currentEventId);
    await showSignedInApp();
  }

  // Points Tournament loads at the server's Current Event (sent by sign-in and by "who am I").
  function applyCurrentEventId(eventId) {
    if (!eventId) return;
    defaultTournament.id = eventId;
    if (state.tournament) state.tournament.id = eventId;
  }

  async function showSignedInApp() {
    const user = session.user();
    state.profileForm = { ...defaultProfileForm, displayName: user.displayName, password: "" };
    state.sessionRestoring = false;

    resolveAndSyncUrlView("home");

    clearUnavailableActiveGameForRole(user);
    state.mobileNavOpen = false;
    applyCurrentUserToSetup();
    const historyPromise = refreshSharedHistory(false);
    const tournamentPromise = refreshSharedTournament(false);
    const networkPromise = loadNetworkInfo();
    const usersPromise = isSuperAdmin() ? fetchUsers(false) : Promise.resolve();
    const countsPromise = isStaff() ? fetchUserCounts() : Promise.resolve();
    if (isStaff()) {
      fetchQlikReloadTime();
    }
    update();
    scrollToPageTopSoon();
    Promise.all([historyPromise, tournamentPromise, networkPromise, usersPromise, countsPromise]).then(() => update());
  }

  function applyCurrentUserToSetup() {
    const user = session.user();
    if (!user) return;

    if (setupValidation && typeof setupValidation.applyVisitorPrefill === "function") {
      state.setup = normalizeSetup(setupValidation.applyVisitorPrefill(state.setup, user, isVisitor()));
    } else {
      const currentP1 = (state.setup && state.setup.teamAPlayer1) || "";
      const shouldPrefill = isVisitor() && !currentP1.trim();
      state.setup = normalizeSetup({
        ...state.setup,
        scorerName: user.displayName,
        teamAPlayer1: shouldPrefill ? user.displayName : currentP1,
      });
    }
    saveSetupSoon();
  }

  function clearUnavailableActiveGameForRole(userOverride) {
    const user = userOverride || session.user();
    if (!user) return;
    // The stored Match stays in the browser so its owner gets it back after another role signs in here.
    const game = state.currentGame || loadActiveGame();
    const shouldClear =
      user.role === "player" ||
      (user.role === "visitor" && game && !isVisitorGameForUser(game, user)) ||
      ((user.role === "super_admin" || user.role === "admin") && game && isVisitorGame(game));
    if (!shouldClear) {
      state.currentGame = game;
      return;
    }

    state.currentGame = null;
    state.recoveryPrompt = false;
    state.undoStack = [];
    state.liveScoreExpanded = false;
    state.liveScoreFocusId = "";
  }

  function currentUserSummary() {
    const user = session.user();
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  }

  function stampVisitorGame(game) {
    const user = session.user();
    if (!game || !user || user.role !== "visitor") return game;

    game.matchScope = "visitor";
    game.createdBy = currentUserSummary();
    game.scorerName = cleanName(game.scorerName, user.displayName || user.username || "Visitor");
    return game;
  }

  function visibleHistory() {
    return Array.isArray(state.history) ? state.history : [];
  }

  function historyStatusText(games) {
    if (isStaff()) return state.historyStatus;
    if (isVisitor()) {
      return `Showing ${games.length} permanent visitor match${games.length === 1 ? "" : "es"} from ${state.historySource === "shared" ? "shared history" : "local cache"}.`;
    }
    return `Showing ${games.length} match${games.length === 1 ? "" : "es"} for your account from ${state.historySource === "shared" ? "shared history" : "local cache"}.`;
  }

  function visitorGames() {
    return visibleHistory();
  }

  function visitorSelfGames() {
    const user = session.user();
    return visitorGames().filter((game) => isVisitorGameForUser(game, user));
  }

  function visitorOtherGames() {
    const user = session.user();
    return visitorGames().filter((game) => !isVisitorGameForUser(game, user));
  }

  function isVisitorGame(game) {
    return Boolean(game && (game.matchScope === "visitor" || game.createdBy && game.createdBy.role === "visitor"));
  }

  function isVisitorGameForUser(game, user) {
    if (!game || !user) return false;
    if (!isVisitorGame(game)) return false;
    if (game.createdBy && Number(game.createdBy.id) === Number(user.id)) return true;
    const email = String(user.username || "").trim().toLowerCase();
    return Boolean(email && game.createdBy && String(game.createdBy.username || "").trim().toLowerCase() === email);
  }

  function visitorGameOwnerName(game) {
    const owner = game && game.createdBy ? game.createdBy : null;
    return cleanName(owner && owner.displayName, owner && owner.username ? owner.username : "Visitor");
  }

  function mergeHistoryGames(primary, secondary) {
    const seen = new Set();
    return [primary, secondary]
      .flatMap((group) => (Array.isArray(group) ? group : []))
      .filter((game) => {
        if (!game || !game.id || seen.has(game.id)) return false;
        seen.add(game.id);
        return true;
      })
      .sort(compareHistoryGamesDesc)
      .slice(0, 200);
  }

  function compareHistoryGamesDesc(first, second) {
    return historyGameTime(second) - historyGameTime(first);
  }

  function historyGameTime(game) {
    const raw = game && (game.endedAt || game.createdAt || game.savedAt);
    const time = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
  }

  function playerTournamentMatches() {
    const user = session.user();
    if (!user) return [];
    return state.tournament.matches.filter((match) => matchPlayers(match).some((player) => sameName(player, user.displayName) || sameName(player, user.username)));
  }

  // Matches the backend's normalize_player_name(): trimmed, internal whitespace collapsed to one
  // space, compared regardless of case, so "John  Doe" and "John Doe" are the same name here too.
  function sameName(first, second) {
    const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
    return normalize(first) === normalize(second);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function resetBrowserDataForCleanDeploy() {
    try {
      if (window.localStorage.getItem(DATA_RESET_KEY) === APP_DATA_RESET_VERSION) return;
      [HISTORY_KEY, ACTIVE_KEY, TOURNAMENT_KEY, "ac-pickle-score-setup-v1"].forEach((key) => {
        window.localStorage.removeItem(key);
      });
      window.localStorage.setItem(DATA_RESET_KEY, APP_DATA_RESET_VERSION);
    } catch (error) {
      // The shared database reset still keeps deployment data clean.
    }
  }

  function scrollToPageTopSoon() {
    window.requestAnimationFrame(function () {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }

  function sharePageUrl() {
    const networkUrl = state.network && state.network.preferredUrl ? state.network.preferredUrl : "";
    return networkUrl || window.location.href.split("#")[0].split("?")[0];
  }

  function canUndo(game) {
    return rallyEngine ? rallyEngine.canUndo(game) : Boolean(game && Array.isArray(game.events) && game.events.length > 0);
  }

  function scoreCall(game) {
    return rallyEngine ? rallyEngine.scoreCall(game) : "";
  }

  function servePosition(game) {
    return rallyEngine ? rallyEngine.servePosition(game) : { side: "right", label: "Right", parity: "even" };
  }

  function actionText(event, game) {
    return rallyEngine ? rallyEngine.actionText(event, game) : "Rally recorded";
  }

  function isSwitchEndsRally(game) {
    return rallyEngine ? rallyEngine.isSwitchEndsRally(game) : false;
  }

  function timeoutsLeft(game, key) {
    return rallyEngine ? rallyEngine.timeoutsLeft(game, key) : 0;
  }

  function teamName(game, key) {
    return rallyEngine ? rallyEngine.teamName(game, key) : (key === "A" ? game.teamA.name : game.teamB.name);
  }

  function teamByKey(game, key) {
    return rallyEngine ? rallyEngine.teamByKey(game, key) : (key === "A" ? game.teamA : game.teamB);
  }

  function doublesPlayers(teamPrefix, playerOne, playerTwo) {
    return [
      cleanName(playerOne, ""),
      cleanName(playerTwo, ""),
    ];
  }

  function initialDoublesPositions() {
    return rallyEngine ? rallyEngine.initialDoublesPositions() : { right: 0, left: 1 };
  }

  function ensureDoublesTracking(game) {
    if (rallyEngine) rallyEngine.ensureDoublesTracking(game);
  }

  function swapDoublesPositions(team) {
    if (rallyEngine) rallyEngine.swapDoublesPositions(team);
  }

  function doublesPartnerIndex(game, teamKey, playerIndex) {
    return rallyEngine ? rallyEngine.doublesPartnerIndex(game, teamKey, playerIndex) : (playerIndex === 0 ? 1 : 0);
  }

  function sideForPlayerIndex(game, teamKey, playerIndex) {
    return rallyEngine ? rallyEngine.sideForPlayerIndex(game, teamKey, playerIndex) : "right";
  }

  function playerNameByIndex(game, teamKey, playerIndex) {
    return rallyEngine ? rallyEngine.playerNameByIndex(game, teamKey, playerIndex) : "";
  }

  function playerNameAtSide(game, teamKey, side) {
    return rallyEngine ? rallyEngine.playerNameAtSide(game, teamKey, side) : "";
  }

  function currentServerName(game) {
    return rallyEngine ? rallyEngine.currentServerName(game) : "";
  }

  function otherTeam(key) {
    return rallyEngine ? rallyEngine.otherTeam(key) : (key === "A" ? "B" : "A");
  }

  function gameTitle(game) {
    return `${game.teamA.name} vs ${game.teamB.name}`;
  }

  function finalScore(game) {
    return rallyEngine ? rallyEngine.finalScore(game) : `${game.teamA.score} - ${game.teamB.score}`;
  }

  function cleanName(value, fallback) {
    const name = String(value || "").trim();
    return name || fallback;
  }

  function normalizeSetup(setup) {
    return {
      ...defaultSetup,
      ...setup,
      type: setup.type === "singles" ? "singles" : "doubles",
      scorerName: cleanName(setup.scorerName, "Court 1").slice(0, 48),
      teamAName: "Team A",
      teamBName: "Team B",
      teamAPlayer1: String(setup.teamAPlayer1 || "").slice(0, 32),
      teamAPlayer2: String(setup.teamAPlayer2 || "").slice(0, 32),
      teamBPlayer1: String(setup.teamBPlayer1 || "").slice(0, 32),
      teamBPlayer2: String(setup.teamBPlayer2 || "").slice(0, 32),
      firstServer: setup.firstServer === "B" ? "B" : "A",
      teamARight: Number(setup.teamARight) === 1 ? 1 : 0,
      teamBRight: Number(setup.teamBRight) === 1 ? 1 : 0,
      targetScore: [11, 15, 21].includes(Number(setup.targetScore)) ? Number(setup.targetScore) : 11,
      winByTwo: Boolean(setup.winByTwo),
    };
  }

  function normalizeTournament(tournament) {
    const source = tournament || {};
    const hasTimingSettings = Number(source.timingVersion) >= 1;
    const matches = Array.isArray(source.matches)
      ? source.matches
          .map((match, index) =>
            normalizeTournamentMatchResult({
              id: match.id || `open_saved_${index + 1}`,
              round: Number(match.round) || 1,
              court: Number(match.court) || 1,
              teamA: normalizeTournamentTeam(match.teamA),
              teamB: normalizeTournamentTeam(match.teamB),
              scoreA: match.scoreA || "",
              scoreB: match.scoreB || "",
              status: match.status === "completed" ? "completed" : match.status === "in_progress" ? "in_progress" : "scheduled",
              winner: match.winner === "B" ? "B" : match.winner === "A" ? "A" : null,
              completedAt: match.completedAt || null,
              gameId: match.gameId || null,
              durationSeconds: Number(match.durationSeconds) || null,
              durationMinutes: Number(match.durationMinutes) || null,
              startedAt: match.startedAt || null,
              startedBy: match.startedBy || null,
              activeGameId: match.activeGameId || null,
            })
          )
          .filter((match) => match.teamA.length === 2 && match.teamB.length === 2)
      : [];

    return {
      ...defaultTournament,
      ...source,
      id: cleanName(source.id, defaultTournament.id).slice(0, 96),
      name: cleanName(source.name, "Open Play").slice(0, 48),
      courts: clampNumber(Number(source.courts) || defaultTournament.courts, 1, 16),
      matchesPerPlayer: clampNumber(Number(source.matchesPerPlayer) || defaultTournament.matchesPerPlayer, 1, 30),
      targetScore: clampNumber(Number(source.targetScore) || defaultTournament.targetScore, 1, 99),
      averageGameMinutes: hasTimingSettings
        ? clampNumber(Number(source.averageGameMinutes) || defaultTournament.averageGameMinutes, 5, 60)
        : defaultTournament.averageGameMinutes,
      transitionMinutes: hasTimingSettings
        ? clampNumber(source.transitionMinutes === 0 ? 0 : Number(source.transitionMinutes) || defaultTournament.transitionMinutes, 0, 20)
        : defaultTournament.transitionMinutes,
      bufferMinutes: hasTimingSettings
        ? clampNumber(source.bufferMinutes === 0 ? 0 : Number(source.bufferMinutes) || defaultTournament.bufferMinutes, 0, 120)
        : defaultTournament.bufferMinutes,
      timingVersion: defaultTournament.timingVersion,
      winByTwo: source.winByTwo === undefined ? true : Boolean(source.winByTwo),
      playersText: String(source.playersText || "").slice(0, 4000),
      matches,
      generatedAt: source.generatedAt || null,
      seed: source.seed || null,
      _updatedAt: source._updatedAt || null,
    };
  }

  function normalizeTournamentTeam(team) {
    return Array.isArray(team) ? team.map((player) => cleanName(player, "")).filter(Boolean).slice(0, 2) : [];
  }

  // The preview names a team by its players once they are typed.
  function setupTeamLabel(key) {
    const players = state.setup.type === "doubles" ? [state.setup[`team${key}Player1`], state.setup[`team${key}Player2`]] : [state.setup[`team${key}Player1`]];
    return players.map((name) => String(name || "").trim()).filter(Boolean).join(" / ") || `Team ${key}`;
  }

  // The Player at an index on a Team, named once typed.
  function setupPlayerLabel(key, index) {
    return String(state.setup[`team${key}Player${index + 1}`] || "").trim() || `Player ${index + 1}`;
  }

  function teamNameFromSetup(key) {
    return key === "B" ? "Team B" : "Team A";
  }

  function gameToSetup(game) {
    return normalizeSetup({
      type: game.type,
      scorerName: game.scorerName || state.setup.scorerName || "Court 1",
      teamAName: game.teamA.name,
      teamBName: game.teamB.name,
      teamAPlayer1: game.teamA.players[0] || "",
      teamAPlayer2: game.teamA.players[1] || "",
      teamBPlayer1: game.teamB.players[0] || "",
      teamBPlayer2: game.teamB.players[1] || "",
      firstServer: game.firstServer || game.servingTeam,
      teamARight: game.teamA.startingRight,
      teamBRight: game.teamB.startingRight,
      targetScore: game.targetScore,
      winByTwo: game.winByTwo,
    });
  }

  function saveSetup() {
    try {
      window.localStorage.setItem("ac-pickle-score-setup-v1", JSON.stringify(state.setup));
    } catch (error) {
      // localStorage can be unavailable in hardened browser modes.
    }
  }

  function loadSetup() {
    try {
      const saved = window.localStorage.getItem("ac-pickle-score-setup-v1");
      return saved ? normalizeSetup(JSON.parse(saved)) : { ...defaultSetup };
    } catch (error) {
      return { ...defaultSetup };
    }
  }

  function saveTournament() {
    if (sharedStore) {
      sharedStore.saveLocalTournament(state.tournament);
      return;
    }
    try {
      window.localStorage.setItem(TOURNAMENT_KEY, JSON.stringify(state.tournament));
    } catch (error) {
      showToast("Tournament could not be saved in this browser");
    }
  }

  function loadTournament() {
    if (sharedStore) {
      return sharedStore.loadLocalTournament();
    }
    try {
      const saved = window.localStorage.getItem(TOURNAMENT_KEY);
      return saved ? normalizeTournament(JSON.parse(saved)) : { ...defaultTournament };
    } catch (error) {
      return { ...defaultTournament };
    }
  }

  function saveHistory() {
    if (sharedStore) {
      sharedStore.saveLocalHistory(state.history);
      return;
    }
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
    } catch (error) {
      showToast("History could not be saved in this browser");
    }
  }

  function loadHistory() {
    if (sharedStore) {
      return sharedStore.loadLocalHistory();
    }
    try {
      const saved = window.localStorage.getItem(HISTORY_KEY);
      const games = saved ? JSON.parse(saved) : [];
      return Array.isArray(games) ? games : [];
    } catch (error) {
      return [];
    }
  }

  function saveActiveGame() {
    try {
      window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(state.currentGame));
    } catch (error) {
      showToast("Active match could not be saved in this browser");
    }
  }

  function loadActiveGame() {
    try {
      const saved = window.localStorage.getItem(ACTIVE_KEY);
      const game = saved ? JSON.parse(saved) : null;
      return game && game.status === "active" ? game : null;
    } catch (error) {
      return null;
    }
  }

  function clearActiveGame() {
    try {
      window.localStorage.removeItem(ACTIVE_KEY);
    } catch (error) {
      // Ignore storage cleanup failures.
    }
  }

  function requestReplaceActive(onConfirm, trigger) {
    const game = state.currentGame;
    if (!game || game.status !== "active") return false;
    return requestDestructiveConfirmation({
      title: `Replace ${gameTitle(game)}?`,
      description: `${gameTitle(game)} is currently active at ${finalScore(game)}. Continuing removes this active Match without saving it to Match History and starts the selected Match instead.`,
      cancelLabel: "Keep Match",
      confirmLabel: "Replace Match",
    }, async () => {
      // A replaced Tournament Match goes back to the schedule, or it stays ongoing with no scoreboard to finish it.
      if (game.tournamentMatch) await postSharedTournamentMatch(tournamentMatchUpdateFromGame(game, "scheduled"), { intent: "unlock-match" });
      return onConfirm();
    }, trigger);
  }

  function requestDestructiveConfirmation(details, onConfirm, trigger) {
    if (!confirmationController) return false;
    const returnFocus = trigger
      ? { action: trigger.dataset.action, value: trigger.dataset.value || "" }
      : null;
    state.dialogChoices = Array.isArray(details.fields)
      ? Object.fromEntries(details.fields.map((field) => [field.key, String(field.value)]))
      : {};
    return confirmationController.open(details, onConfirm, returnFocus);
  }

  // The same dialog, asking a question instead of confirming a destructive action.
  function requestChoiceConfirmation(details, onConfirm, trigger) {
    const choiceDetails = { ...details, tone: "choice" };
    return requestDestructiveConfirmation(choiceDetails, onConfirm, trigger);
  }

  function restoreConfirmationFocus(returnFocus) {
    if (renderScheduler) renderScheduler.flush();
    const target = returnFocus
      ? Array.from(app.querySelectorAll("[data-action]")).find((element) => (
        element.dataset.action === returnFocus.action
        && (element.dataset.value || "") === returnFocus.value
        && !element.disabled
      ))
      : null;
    if (target && typeof target.focus === "function") {
      target.focus({ preventScroll: true });
      return;
    }
    if (navigationFocus) navigationFocus.focusDestinationHeading(app);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function capitalize(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
  }

  function roleLabel(role) {
    if (role === "super_admin") return "Super Admin";
    if (role === "admin") return "Admin";
    if (role === "visitor") return "Visitor";
    return "Player";
  }

  function clampNumber(value, min, max) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function formatDateTime(value) {
    if (!value) return "Unknown date";
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value));
    } catch (error) {
      return value;
    }
  }

  function formatFreshness(timestamp, isPending) {
    if (isPending) {
      return "Updating… (showing previous data)";
    }
    if (!timestamp) return "";
    try {
      const diffSec = Math.round((Date.now() - timestamp) / 1000);
      if (diffSec < 15) return "Updated just now";
      if (diffSec < 60) return `Updated ${diffSec}s ago`;
      const minutes = Math.floor(diffSec / 60);
      if (minutes < 60) return `Updated ${minutes}m ago`;
      const date = new Date(timestamp);
      const hours = String(date.getHours()).padStart(2, "0");
      const mins = String(date.getMinutes()).padStart(2, "0");
      return `Updated at ${hours}:${mins}`;
    } catch (error) {
      return "";
    }
  }

  function renderRefreshErrorBanner(error, action) {
    if (!error) return "";
    return `<div class="data-refresh-error-banner" role="status"><span>${escapeHtml(error)}</span> <button class="button small ghost" data-action="${escapeAttr(action)}">Retry</button></div>`;
  }

  function formatDuration(start, end) {
    if (!start || !end) return "In progress";
    const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes < 1) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function showToast(message) {
    if (toastManager) {
      toastManager.show(message);
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        return fallbackCopy(text);
      }
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  }
})();
