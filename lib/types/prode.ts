export interface Match {
  id: string;
  matchday: string;
  team_home: string;
  team_away: string;
  kickoff_at: string;
  status: "not_started" | "in_progress" | "finished";
}

export interface Prediction {
  match_id: string;
  pred_score_home: number | null;
  pred_score_away: number | null;
}

export interface LeaderboardUser {
  user_id: string;
  username: string;
  avatar_url: string;
  points: number;
  exact_hits: number;
}

// Mock Data
export const MOCK_MATCHES: Match[] = [
  {
    id: "m1",
    matchday: "Grupo A - Fecha 1",
    team_home: "ARG",
    team_away: "MEX",
    kickoff_at: "2026-06-11T16:00:00Z",
    status: "not_started",
  },
  {
    id: "m2",
    matchday: "Grupo A - Fecha 1",
    team_home: "USA",
    team_away: "CAN",
    kickoff_at: "2026-06-12T20:00:00Z",
    status: "not_started",
  },
  {
    id: "m3",
    matchday: "Grupo B - Fecha 1",
    team_home: "BRA",
    team_away: "FRA",
    kickoff_at: "2026-06-13T15:00:00Z",
    status: "in_progress",
  },
  {
    id: "m4",
    matchday: "Grupo B - Fecha 1",
    team_home: "ESP",
    team_away: "GER",
    kickoff_at: "2026-06-10T12:00:00Z",
    status: "finished",
  },
];

export const MOCK_PREDICTIONS: Record<string, Prediction> = {
  m3: { match_id: "m3", pred_score_home: 1, pred_score_away: 1 },
  m4: { match_id: "m4", pred_score_home: 2, pred_score_away: 0 },
};

export const MOCK_LEADERBOARD: LeaderboardUser[] = [
  {
    user_id: "u1",
    username: "Lionel Messi",
    avatar_url: "https://i.pravatar.cc/150?u=u1",
    points: 120,
    exact_hits: 4,
  },
  {
    user_id: "u2",
    username: "Dibu Martinez",
    avatar_url: "https://i.pravatar.cc/150?u=u2",
    points: 105,
    exact_hits: 3,
  },
  {
    user_id: "u3",
    username: "MateoLitrenta",
    avatar_url: "",
    points: 90,
    exact_hits: 2,
  },
  {
    user_id: "u4",
    username: "Scaloni",
    avatar_url: "https://i.pravatar.cc/150?u=u4",
    points: 85,
    exact_hits: 2,
  },
  {
    user_id: "u5",
    username: "Angel Di Maria",
    avatar_url: "https://i.pravatar.cc/150?u=u5",
    points: 70,
    exact_hits: 1,
  },
];
