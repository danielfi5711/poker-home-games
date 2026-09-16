import type { Session, SettlementResult, Transfer } from '../shared/types.js';

/**
 * Nets every player (cash-out − total buy-ins), then greedily matches the
 * largest creditor against the largest debtor, repeatedly, until everyone is
 * settled. This is the standard "minimum cash flow" approach (as used by
 * Splitwise etc.) — not always the mathematically fewest possible transfers,
 * but always correct and close to minimal, in O(n log n).
 *
 * If nets don't sum to zero (`discrepancyCents !== 0`), one side runs out
 * before the other and the remainder is simply left unmatched — the
 * discrepancy itself is what the UI warns about, since it means a buy-in or
 * cash-out count doesn't add up.
 */
export function computeSettlement(session: Session): SettlementResult {
  const netsCents: Record<string, number> = {};
  let complete = true;

  for (const player of Object.values(session.players)) {
    const totalBuyIns = player.buyIns.reduce((sum, b) => sum + b.totalCents, 0);
    const cashOutCents = player.cashOut?.totalCents ?? 0;
    if (!player.cashOut) complete = false;
    netsCents[player.id] = cashOutCents - totalBuyIns;
  }

  const discrepancyCents = Object.values(netsCents).reduce((a, b) => a + b, 0);

  interface Party {
    playerId: string;
    amountCents: number;
  }
  const creditors: Party[] = [];
  const debtors: Party[] = [];
  for (const [playerId, net] of Object.entries(netsCents)) {
    if (net > 0) creditors.push({ playerId, amountCents: net });
    else if (net < 0) debtors.push({ playerId, amountCents: -net });
  }

  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.amountCents - a.amountCents);
    debtors.sort((a, b) => b.amountCents - a.amountCents);
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.amountCents, debtor.amountCents);
    if (amount > 0) {
      transfers.push({ fromPlayerId: debtor.playerId, toPlayerId: creditor.playerId, amountCents: amount });
    }
    creditor.amountCents -= amount;
    debtor.amountCents -= amount;
    if (creditor.amountCents === 0) creditors.shift();
    if (debtor.amountCents === 0) debtors.shift();
  }

  return { netsCents, transfers, discrepancyCents, complete };
}
