// js/draw.js
import { db } from "./config.js";
import {
  doc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

function fisherYates(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function runDraw(participants, tiers) {
  const n = participants.length;

  // Validate
  for (const tier of tiers) {
    if (tier.teams.length < n) {
      throw new Error(`${tier.label} has only ${tier.teams.length} teams for ${n} participants.`);
    }
  }

  // Shuffle each tier's team pool and take first n
  const assignments = {}; // { participantId: { tierKey: team } }
  participants.forEach(p => { assignments[p.id] = {}; });

  for (const tier of tiers) {
    const shuffled = fisherYates(tier.teams).slice(0, n);
    participants.forEach((p, i) => {
      assignments[p.id][tier.key] = shuffled[i];
    });
  }

  // Write all participant docs + pool.drawCompleted in one batch
  const batch = writeBatch(db);

  participants.forEach((p, i) => {
    const ref = doc(db, "pool", "main", "participants", p.id);
    batch.update(ref, {
      teams: assignments[p.id],
      drawOrder: i + 1
    });
  });

  const poolRef = doc(db, "pool", "main");
  batch.update(poolRef, {
    drawCompleted: true,
    drawDate: serverTimestamp()
  });

  await batch.commit();
}
