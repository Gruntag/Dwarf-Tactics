const VICTORY_POINTS_KEY = 'gruntag_victory_points';

export const getVictoryPoints = (): number => {
  const stored = localStorage.getItem(VICTORY_POINTS_KEY);
  return stored ? parseInt(stored, 10) : 0;
};

export const addVictoryPoint = (): number => {
  const current = getVictoryPoints();
  const newTotal = current + 1;
  localStorage.setItem(VICTORY_POINTS_KEY, newTotal.toString());
  return newTotal;
};
