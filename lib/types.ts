export type SurveyResponse = {
  id: string;
  campaign_id: string;
  survey_id: string | null;
  question_set_id: string | null;
  publisher: string | null;
  placement: string | null;
  club: string | null;
  competition: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
  country: string | null;
  fan_segment: string | null;
  device: string | null;
  browser: string | null;
  response_duration_seconds: number | null;
  created_at: string;
};
