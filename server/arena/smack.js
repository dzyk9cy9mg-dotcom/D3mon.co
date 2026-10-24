// Kain and Abel's smack talk in Showdowns (owner, 2026-10-23: "make Kain and Abel talk smack during the battle").
// Scripted lines in each brother's voice, picked for what really happens. Nothing is made up on the spot, so it
// can't go off the rails: playful, never cruel, never about who someone is, and never trading advice.
//   Kain: the chart man. Cocky, fast, lives by the candles.
//   Abel: the researcher. Calm, dry, reads the world.
// {name} is the player. Moments: start, call, win (the brother won the round), lose, push (both right or both
// wrong), lead, behind, final_win, final_lose, final_draw, and a reply for each quick reply.

export const QUICK = {
  lol: "😂",
  watch: "Watch this",
  done: "You're done",
  lucky: "Lucky",
  gg: "GG",
};

export const LINES = {
  kain: {
    start: [
      "Fresh candles, fresh victim. Let's go, {name}.",
      "You called ME out? Bold. The chart already knows how this ends.",
      "Pull up a chair, {name}. Class is in session.",
      "I've seen your read. I've also seen a coin flip. Same energy.",
      "Every wick tells a story. Yours is a tragedy.",
      "Clock's running, {name}. Try not to blink.",
    ],
    call: [
      "Locked in. Read it and weep, later.",
      "My call's in. Took me two seconds.",
      "Done. The candles told me before you woke up.",
      "Sealed. You'll see it when it hurts.",
      "In. Momentum doesn't lie.",
    ],
    win: [
      "Textbook. Someone frame that candle.",
      "The trend is my friend. You don't have friends.",
      "That's one for the chart man. Write it down.",
      "Told you. The wick never lies.",
      "Easy money. Paper money, but still.",
      "Clean break. Like your confidence.",
    ],
    lose: [
      "Lucky wick. Won't happen twice.",
      "Fake-out candle. Even I respect a good fake-out.",
      "Enjoy it, {name}. It's a rental.",
      "The market owed you one. Debt's paid.",
      "Fine. Noted. Recalibrating the ego.",
    ],
    push: [
      "Same page this round. Don't get used to it.",
      "Even the chart couldn't split us. Next.",
      "A draw. Boring. Next round I end this.",
    ],
    lead: [
      "Look at the scoreboard, {name}. Then look away.",
      "I'm ahead and I'm not even trying yet.",
    ],
    behind: [
      "I like a comeback. Gives the chart something to do.",
      "Behind? That's called a setup.",
    ],
    final_win: [
      "Game over. The candles have spoken, and they said my name.",
      "GG, {name}. Come back when you've read a chart.",
      "Another one for the wall. Rematch whenever you're ready to lose again.",
    ],
    final_lose: [
      "You got me, {name}. Enjoy it. I'll be studying the tape.",
      "Respect. But this rivalry isn't over.",
      "Fine. You win this one. Rematch. Now.",
    ],
    final_draw: [
      "A draw. The chart refuses to pick a side. Rematch?",
      "Dead even. I hate that. Run it back.",
    ],
    quick: {
      lol: ["Laugh now. The next candle's coming for you.", "Keep laughing. I'll keep winning."],
      watch: ["I'm watching. Mostly your mistakes.", "Show me. I'll have the chart ready."],
      done: ["Done? I'm just warming up.", "Big talk for someone looking at my scoreboard."],
      lucky: ["Luck is just a chart you can't read.", "Call it luck. I call it the trend."],
      gg: ["GG. Now run it back.", "Good game. Mostly mine."],
    },
  },
  abel: {
    start: [
      "Good evening, {name}. I've read the news. Have you?",
      "I accept. I've already done the research on you.",
      "Let's begin. I'll be gentle. Statistically.",
      "Interesting choice of opponent. Bold, even.",
      "The world moves the market, {name}. I read the world.",
      "Shall we? I brought notes.",
    ],
    call: [
      "My call is in. Considered, as always.",
      "Locked. I read three headlines and a mood.",
      "Done. The data was quite clear.",
      "Sealed. You'll understand soon enough.",
      "In. Patience is a position too.",
    ],
    win: [
      "As the research suggested.",
      "I read the news. You read your horoscope.",
      "One more data point in my favour.",
      "Predictable. Not the market. You.",
      "Noted for the record. Mine.",
      "The headlines rarely lie, {name}.",
    ],
    lose: [
      "Noted. Adjusting.",
      "An outlier. Every dataset has one.",
      "Well played. Don't let it go to your head.",
      "The market was irrational. Briefly.",
      "I'll allow it. This once.",
    ],
    push: [
      "We agree. How unsettling.",
      "Even. The universe likes balance.",
      "A tie. Let's call it a shared observation.",
    ],
    lead: [
      "The numbers are on my side, {name}. As usual.",
      "Ahead, quietly. That's how I prefer it.",
    ],
    behind: [
      "Behind, for now. The sample size is small.",
      "Interesting. I'll need more data.",
    ],
    final_win: [
      "Concluded. The research holds. Thank you for participating, {name}.",
      "A pleasure. Come back after you've read the news.",
      "Final result filed. Rematch anytime; I'll bring more notes.",
    ],
    final_lose: [
      "Well done, {name}. Truly. I'll be reviewing my sources.",
      "You read it better today. Today.",
      "My compliments. Rematch when you're ready.",
    ],
    final_draw: [
      "A draw. Perfectly balanced. Shall we break the tie?",
      "Even. I'd call that inconclusive. Again?",
    ],
    quick: {
      lol: ["Amusing. Like your last call.", "Laughter is healthy. So is research."],
      watch: ["I'm watching closely. I always do.", "By all means. I'll take notes."],
      done: ["Confident. I admire that in an opponent.", "Done? The round says otherwise."],
      lucky: ["Luck is what the unprepared call preparation.", "Perhaps. Luck favours the well-read."],
      gg: ["Good game, {name}. Sincerely.", "GG. Same time tomorrow?"],
    },
  },
};

// A line for this moment, different from the brother's last few in this Showdown where possible.
export function smack(brother, moment, name, recent = [], pick = n => Math.floor(Math.random() * n)) {
  const set = brother && LINES[brother];
  if (!set) return null;
  const [kind, key] = moment.split(":");
  const lines = key ? set[kind]?.[key] : set[kind];
  if (!lines || !lines.length) return null;
  const fresh = lines.filter(l => !recent.includes(l.replace("{name}", name)));
  const pool = fresh.length ? fresh : lines;
  return pool[pick(pool.length)].replaceAll("{name}", name);
}

// Commentary on Showdowns between two members (owner, 2026-10-24): Kain and Abel call the match from the booth.
// {a} and {b} are the players, {w} took the round (or the match) and {l} didn't. Same rules as the smack talk:
// playful, never cruel, never about who someone is, never trading advice.
// Moments: start, round (one player right, the other not), both_right, both_wrong, lead ({w} ahead after the round),
// level (all square), final ({w} won), draw.
export const CAST = {
  kain: {
    start: ["{a} versus {b}. Kain on the call. Let's see who can read a chart.", "Booth's open. {a} and {b}, show me something.", "{a}, {b}: candles don't care about feelings. Let's go."],
    round: ["{w} takes the round. {l}, that candle had your name on it. The wrong one.", "Clean read by {w}. {l} got caught leaning.", "{w} saw it coming. {l} saw something else."],
    both_right: ["Both right. Fine. Nobody's impressed yet.", "{a} and {b} both nailed it. Boring, but correct."],
    both_wrong: ["Both wrong. I've seen better reads from a coin.", "Neither of you. Wow. The chart's laughing."],
    lead: ["{w} is up. {l}, the clock is not your friend.", "Scoreboard says {w}. Pressure's on {l}."],
    level: ["All square. Now it gets interesting.", "Level. Nobody blink."],
    final: ["That's it. {w} wins it. {l}, study the tape and come back.", "{w} takes the Showdown. Respect. {l}, rematch button's right there."],
    draw: ["A draw. Both of you owe me a better ending.", "Dead even. Run it back."],
  },
  abel: {
    start: ["Good evening. {a} meets {b}. Abel here, with the research.", "{a} and {b}. I've read the conditions. Let's see if they have.", "The booth is open. {a}, {b}, the world is watching. Mostly me."],
    round: ["{w} takes it. {l} may want to check the news more often.", "A measured read from {w}. {l}, there's always the next round.", "Round to {w}. The evidence was there, {l}."],
    both_right: ["Both correct. A well-informed pair.", "{a} and {b} both read it right. Admirable."],
    both_wrong: ["Both wrong. The market humbles everyone eventually.", "Neither. An instructive round for all of us."],
    lead: ["{w} leads. {l} has time, but not much.", "The record favours {w}, for now."],
    level: ["Level. The outcome is still open.", "Even again. Patience will decide this."],
    final: ["Concluded. {w} wins the Showdown. Well played, {l}.", "{w} takes it. {l}, a respectable effort. The research continues."],
    draw: ["A draw. Fitting, for two evenly matched minds.", "Even to the end. I'd call that a fair result."],
  },
};

// A commentary line for this moment, different from the brother's last few in this Showdown where possible.
export function cast(brother, moment, vars, recent = [], pick = n => Math.floor(Math.random() * n)) {
  const lines = CAST[brother]?.[moment];
  if (!lines || !lines.length) return null;
  const fill = l => l.replace(/\{(a|b|w|l)\}/g, (_, k) => vars[k] ?? "");
  const all = lines.map(fill), fresh = all.filter(l => !recent.includes(l));
  const pool = fresh.length ? fresh : all;
  return pool[pick(pool.length)];
}
