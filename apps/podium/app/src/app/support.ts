import { persisted, usePersisted } from "../modules/persist";

/** A lightweight in-app support ticket list (status visible to the user).
 * Submitting also opens the mail client; the ticket is logged locally either way. */
export interface Ticket {
  id: string;
  subject: string;
  status: "open" | "replied";
  createdAt: string; // YYYY-MM-DD
}

export const SUPPORT_EMAIL = "support@jeetechstudio.in";

const ticketsStore = persisted<Ticket[]>("podium_support_v1", [], { version: 1 });
export const useTickets = () => usePersisted(ticketsStore);

export function addTicket(subject: string, createdAt: string): Ticket {
  const t: Ticket = { id: `tk_${Date.now()}`, subject: subject.trim().slice(0, 80), status: "open", createdAt };
  ticketsStore.set((list) => [t, ...list]);
  return t;
}
