// Presence for the page's `room` capability. Every open page is in the site-wide room (""), and a page
// can join named rooms too (one per stream it's watching). Peers see each other's presence objects.
const MAX_ROOMS_PER_PAGE = 20;
const MAX_PRESENCE_BYTES = 4096;

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function checkRoomName(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9_-]{0,100}$/.test(name)) throw new RoomError("invalid_argument", "Bad room name");
  return name;
}

export class Rooms {
  // onChange(room, peers, memberPageIds) is called (batched) whenever who's in a room or what they show changes.
  constructor({ onChange, batchMs = 150 }) {
    this.onChange = onChange;
    this.batchMs = batchMs;
    this.rooms = new Map(); // room -> Map(page id -> { peerId, by, presence })
    this.pending = new Set();
    this.timer = null;
  }

  join(pageId, peerId, room, by) {
    let members = this.rooms.get(room);
    if (members?.has(pageId)) return;
    let count = 0;
    for (const m of this.rooms.values()) if (m.has(pageId)) count++;
    if (count >= MAX_ROOMS_PER_PAGE) throw new RoomError("resource_exhausted", "Too many rooms");
    if (!members) this.rooms.set(room, (members = new Map()));
    members.set(pageId, { peerId, by, presence: null });
    this.#mark(room);
  }

  leave(pageId, room) {
    const members = this.rooms.get(room);
    if (!members?.delete(pageId)) return;
    if (!members.size) this.rooms.delete(room);
    this.#mark(room);
  }

  setPresence(pageId, room, presence) {
    if (presence !== null && (typeof presence !== "object" || Array.isArray(presence))) throw new RoomError("invalid_argument", "Presence must be an object");
    if (JSON.stringify(presence).length > MAX_PRESENCE_BYTES) throw new RoomError("invalid_argument", "Presence is too large");
    const me = this.rooms.get(room)?.get(pageId);
    if (!me) throw new RoomError("not_found", "Join the room first");
    me.presence = presence;
    this.#mark(room);
  }

  dropPage(pageId) {
    for (const room of [...this.rooms.keys()]) this.leave(pageId, room);
  }

  peers(room) {
    return [...(this.rooms.get(room)?.values() || [])].map(m => ({ id: m.peerId, by: m.by, presence: m.presence }));
  }

  #mark(room) {
    this.pending.add(room);
    if (!this.timer) this.timer = setTimeout(() => this.#flush(), this.batchMs);
  }

  #flush() {
    this.timer = null;
    const rooms = [...this.pending];
    this.pending.clear();
    for (const room of rooms) this.onChange(room, this.peers(room), [...(this.rooms.get(room)?.keys() || [])]);
  }
}
