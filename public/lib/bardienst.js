// Erstellt einen Bardienstplan: Wochen von Donnerstag bis Mittwoch, je 2 Personen.
// Läuft im Browser (globales Bardienst).

const Bardienst = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (d) => d.toISOString().slice(0, 10);

  // Alle Wochen eines Jahres: beginnt am ersten Donnerstag im Januar,
  // letzte Woche ist die, deren Donnerstag noch im Dezember liegt.
  function weeksOfYear(year) {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const offset = (4 - jan1.getUTCDay() + 7) % 7; // 4 = Donnerstag
    const weeks = [];
    for (let t = jan1.getTime() + offset * DAY; new Date(t).getUTCFullYear() === year; t += 7 * DAY) {
      weeks.push({ start: iso(new Date(t)), end: iso(new Date(t + 6 * DAY)) });
    }
    return weeks;
  }

  // people: [{ name, labels, absences: [{ from, to }] }]
  // Regeln (in dieser Wichtigkeit):
  //  0. Wer in der Woche (Do–Mi) an mindestens einem Tag abwesend ist, wird nicht eingeteilt.
  //  1. Niemand zwei Wochen hintereinander.
  //  2. Alle kommen möglichst gleich oft dran.
  //  3. Dieselben zwei möglichst nicht nochmal zusammen.
  //  4. Zwei Neumitglieder möglichst nicht zusammen.
  //  5. Wer länger nicht dran war, kommt eher dran.
  // Probiert mehrere zufällige Varianten und nimmt die mit den wenigsten Regelverstößen.
  function generate(year, people, tries = 300) {
    let best = null;
    let bestPenalty = Infinity;
    const isNew = (n) => people.find((p) => p.name === n)?.labels?.includes("Neumitglied");
    for (let i = 0; i < tries && bestPenalty > 0; i++) {
      const weeks = generateOnce(year, people);
      const seen = new Set();
      let penalty = 0;
      weeks.forEach((wk, w) => {
        penalty += wk.names.filter((n) => !n).length * 100000; // leerer Platz (zu wenige da)
        if (w > 0 && wk.names.some((n) => n && weeks[w - 1].names.includes(n))) penalty += 1000;
        const k = [...wk.names].sort().join("\u0000");
        if (seen.has(k)) penalty += 10;
        seen.add(k);
        if (wk.names.every((n) => n && isNew(n))) penalty += 100;
      });
      if (penalty < bestPenalty) {
        best = weeks;
        bestPenalty = penalty;
      }
    }
    return best;
  }

  function generateOnce(year, people, random = Math.random) {
    const weeks = weeksOfYear(year);
    const count = new Map(people.map((p) => [p.name, 0]));
    const lastWeek = new Map(people.map((p) => [p.name, -Infinity]));
    const pairs = new Map();
    const isNew = new Map(people.map((p) => [p.name, (p.labels || []).includes("Neumitglied")]));
    const pairKey = (a, b) => [a, b].sort().join("\u0000");
    const jitter = new Map(); // Zufall pro Woche, damit der Plan nicht immer gleich aussieht

    weeks.forEach((week, w) => {
      people.forEach((p) => jitter.set(p.name, random()));
      const names = people.filter((p) => !isAbsent(p, week)).map((p) => p.name);

      const baseScore = (n) => [
        lastWeek.get(n) === w - 1 ? 1 : 0,
        count.get(n),
        lastWeek.get(n), // länger her = kleiner = besser
        jitter.get(n),
      ];

      const first = pick(names, baseScore);
      const second = pick(
        names.filter((n) => n !== first),
        (n) => [
          lastWeek.get(n) === w - 1 ? 1 : 0,
          count.get(n),
          pairs.get(pairKey(first, n)) || 0,
          isNew.get(first) && isNew.get(n) ? 1 : 0,
          lastWeek.get(n),
          jitter.get(n),
        ]
      );

      for (const n of [first, second].filter(Boolean)) {
        count.set(n, count.get(n) + 1);
        lastWeek.set(n, w);
      }
      if (first && second) {
        const k = pairKey(first, second);
        pairs.set(k, (pairs.get(k) || 0) + 1);
      }
      week.names = [first || "", second || ""];
    });

    return weeks;
  }

  // Abwesend, wenn sich irgendeine Abwesenheit mit der Woche überschneidet.
  function isAbsent(person, week) {
    return (person.absences || []).some((a) => a.from <= week.end && a.to >= week.start);
  }

  // Kleinsten Kandidaten nach lexikografischem Score-Vergleich wählen.
  function pick(candidates, score) {
    let best = null;
    let bestScore = null;
    for (const c of candidates) {
      const s = score(c);
      if (!bestScore || compare(s, bestScore) < 0) {
        best = c;
        bestScore = s;
      }
    }
    return best;
  }

  function compare(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  }

  return { weeksOfYear, generate, isAbsent };
})();
