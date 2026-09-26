# PaddlePoint

Scoring app for pickleball Matches and Tournaments, used live at events. Its database is the one place Scores are recorded; analytics work from a read-only copy.

## Language

These are the terms every role sees. Role-specific copy may change who can act or whose view it is, never the term. Names like `game` and `tournament` may remain as historical aliases but do not replace these canonical concepts.

**Match**:
One scored contest between Team A and Team B, played to a target score. Start Match → Match started → Resume Match → End Match → Match saved is the action and feedback progression.
_Avoid_: Game (PaddlePoint plays one scored contest per Match, so there is no separate pickleball game to name), round, set

**Tournament**:
A named event whose Players are scheduled into Tournament Matches across Rounds and courts.
_Avoid_: Open Play (as the event's name), bracket, league

**Open Play**:
The Tournament format PaddlePoint uses: partners rotate, so Teams are formed per Match rather than entered as lasting pairs.
_Avoid_: Tournament (as a synonym), session

**Schedule**:
The generated Rounds and court assignments of a Tournament.
_Avoid_: Draw, fixtures, bracket

**Round**:
One set of Tournament Matches in the Schedule that are played at the same time on different courts.
_Avoid_: Game, set, heat

**Tournament Match**:
A scheduled slot in a Tournament's Schedule (Round, court, two Teams) that is played as one Match.
_Avoid_: Fixture, pairing, game

**Live Board**:
The spectator view of every court's current, next, and completed Tournament Matches.
_Avoid_: Scoreboard, live scores page

**Scoreboard**:
The scorer's controls for the Match in progress: rally buttons, serve position, undo, and end.
_Avoid_: Live Board, score screen

**Event**:
One pickleball event, run as its own Tournament and kept after it ends. Analytics cover every Event, with Event as a filter; outside analytics, just say Tournament. Several Tournaments on one day are separate Events.
_Avoid_: Competition; never for a Rally

**Current Event**:
The one Event that scorers, the Live Board and the Leaderboard use, chosen by a Super Admin. Starting a new Event makes it current; every other Event is a past Event, and a past Event never becomes current again, so starting a new Event cannot be undone.
_Avoid_: Active tournament, latest event, open play (as an id)

**Event window**:
The span of an Event from its first Match start to its last Match end.
_Avoid_: Event hours (the reload schedule), session

**Rally**:
One exchange within a Match, won by one team, resulting in a point, server switch or side-out.
_Avoid_: Event, point (a point is only one possible outcome)

**Team**:
The players on one side of a single Match. In Open Play partners rotate, so a Team is formed per Match rather than entered as a lasting pair.
_Avoid_: Pair (as a lasting unit), squad

**Player**:
A person who plays in Matches, with a lasting identity that survives renames and carries across Events. Matches record the Player, not a name and not an account. Player names are unique, trimmed and compared regardless of case, and every view shows a Player's current name. A Player needs no account; an account may be linked to at most one Player. Names in Visitor Matches are not Players.
_Avoid_: Participant, member, user (a user is someone with an account)

**Visitor**:
Someone outside MTC who scores their own Matches through the Visitor portal, signing in with an email address they have verified. Visitor Matches belong to no Event, and their names are not Players.
_Avoid_: Guest, walk-in (a walk-in is a Player without an account)

**Skill level**:
A Player's playing standard, one of Beginner, Intermediate or Advanced, set by staff and used to balance Open Play. A Player without one is Unrated.
_Avoid_: Rating (a rating is computed from results), rank, DUPR (an external rating PaddlePoint does not import), score

**Merge**:
Folding a duplicate Player into another so every Match, the Skill level and any linked account belong to the surviving Player. Cannot be undone.
_Avoid_: Combine, dedupe, link (linking joins an account to a Player)

**Partnership**:
Two Players who have been on the same Team, across every Match they played together. A Partnership is ranked only after at least 3 Matches together.
_Avoid_: Pair, duo, team (a Team is one side of one Match)

**Leaderboard**:
PaddlePoint's Player and Team standings from finished Matches. Shows the Current Event's Tournament Matches unless the viewer switches to All Events, which also counts Matches played outside any Tournament; it says which one it is showing. Nothing is deleted to give a new Event a fresh Leaderboard. A Visitor's Leaderboard covers only Visitor Matches, which belong to no Event.
_Avoid_: Rankings, standings page, reset (a fresh Leaderboard comes from starting a new Event)

**Event Leaderboard**:
The Leaderboard narrowed to one Event: Player standings from finished Matches, excluding Visitor Matches, ranked the way the app's Leaderboard ranks Players.
_Avoid_: Rankings

**Active Player**:
A Player with at least one finished Match in the current selection.
_Avoid_: Registered player, member

**Close Match**:
A finished Match won by a margin of 2 points or fewer.
_Avoid_: Tight game, nail-biter

**High-scoring Match**:
A finished Match whose winner scored more than the target score.
_Avoid_: Long game, overtime

**Score**:
The points a team has in a Match or Tournament Match, in progress or final.
_Avoid_: Evaluation score, evaluation, rating

**Analytics copy**:
The read-only copy of Scores used for dashboards; never written back to PaddlePoint and never the source of truth.
_Avoid_: Data warehouse (as a synonym), mirror

**Sheet**:
One screen of Qlik objects in the analytics copy, opened in Qlik Cloud for deep exploration. Never shown inside PaddlePoint. Six exist, one per Analytics subject.
_Avoid_: Dashboard, tab, page, report

**Analytics subject**:
One of the six questions analytics answers (Overview, Match Analysis, Leaderboard, Player Performance, Partnership Analysis, Event / Court Analytics). Each has a Sheet in Qlik Cloud and a tab in the Analytics view.
_Avoid_: Sheet (in PaddlePoint), dashboard, report

**Analytics view**:
PaddlePoint's staff-only view that draws the Analytics subjects itself from the analytics copy, one tab per subject.
_Avoid_: Dashboard, Qlik view, BI view, embed
