/**
 * Display titles for exit-ticket activity rows.
 * Same field as Mobile: activity `title` from API / `ticketTitle` on exit_responses.
 * Old rows without that snapshot: one RTDB get per unique ticketId (cached).
 */
import { useEffect, useMemo, useState } from 'react';
import { get, ref as dbRef } from 'firebase/database';
import { db } from '../firebase';

const titleCache = new Map();
const inflight = new Map();

function visibleTitle(value) {
  const text = String(value ?? '').trim();
  if (!text || text === 'undefined' || text === 'null' || text === '—') return '';
  return text;
}

export function isGenericExitTicketTitle(value) {
  const text = visibleTitle(value);
  return !text || text === 'Exit Ticket';
}

export function resolveExitTicketActivityTitle(item, titles = {}) {
  if (item?.type !== 'exitTicket') return visibleTitle(item?.title);
  const own = visibleTitle(item.title);
  if (own && own !== 'Exit Ticket') return own;
  const ticketId = String(item.ticketId || '').trim();
  const fetched = ticketId ? visibleTitle(titles[ticketId] ?? titleCache.get(ticketId)) : '';
  return fetched || 'Exit Ticket';
}

function uniqueTicketIdsNeedingTitle(items) {
  const ids = [];
  (items || []).forEach((item) => {
    if (item?.type !== 'exitTicket') return;
    if (!isGenericExitTicketTitle(item.title)) return;
    const id = String(item.ticketId || '').trim();
    if (!id || ids.includes(id)) return;
    ids.push(id);
  });
  return ids;
}

async function readTicketTitle(ticketId) {
  const snap = await get(dbRef(db, `exit_tickets/${ticketId}`));
  if (!snap.exists()) return '';
  return visibleTitle(snap.val()?.title);
}

export function useExitTicketActivityTitles(items) {
  const [version, setVersion] = useState(0);
  const idsKey = uniqueTicketIdsNeedingTitle(items).join(',');

  useEffect(() => {
    const ids = idsKey ? idsKey.split(',').filter(Boolean) : [];
    ids.forEach((ticketId) => {
      if (titleCache.has(ticketId) || inflight.has(ticketId)) return;
      const request = readTicketTitle(ticketId)
        .then((title) => {
          titleCache.set(ticketId, title);
        })
        .catch(() => {
          titleCache.set(ticketId, '');
        })
        .finally(() => {
          inflight.delete(ticketId);
          setVersion((n) => n + 1);
        });
      inflight.set(ticketId, request);
    });
  }, [idsKey]);

  return useMemo(() => {
    const out = {};
    titleCache.forEach((title, id) => {
      out[id] = title;
    });
    return out;
  }, [version, idsKey]);
}
