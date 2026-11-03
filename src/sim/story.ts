import { ENDING_ID, REACTIONS, STORY, type ReactionId, type StoryPage } from "./dialogue";
import type { GameState } from "./types";

export { clockProgress } from "./economy";
export { ENDING_ID } from "./dialogue";

export function storyPage(id: string): StoryPage | undefined {
  return STORY.find((p) => p.id === id);
}

/** Desbloquea las partes de la historia cuyo hito se ha cumplido. Devuelve las nuevas. */
export function checkStory(s: GameState): string[] {
  const fresh: string[] = [];
  for (const page of STORY) {
    if (s.story.seen.includes(page.id) || !page.when(s)) continue;
    s.story.seen.push(page.id);
    s.story.unread.push(page.id);
    fresh.push(page.id);
    if (page.id === ENDING_ID) {
      s.story.ended = true;
      s.story.endTime = s.timeAll;
    }
  }
  return fresh;
}

/**
 * Marca una reacción como dicha. Devuelve false si es de las que solo se dicen una vez y ya se dijo.
 */
export function claimReaction(s: GameState, id: ReactionId): boolean {
  if (!REACTIONS[id].once) return true;
  if (s.story.reactions.includes(id)) return false;
  s.story.reactions.push(id);
  return true;
}
