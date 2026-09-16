import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId, newJoinCode } from './id.js';
import type { Group } from '../shared/types.js';

export class GroupError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface Data {
  groups: Record<string, Group>;
}

let store: JsonStore<Data>;

export async function initGroups(): Promise<void> {
  store = await JsonStore.load<Data>(config.groupsFile, { groups: {} });
}

function data(): Data {
  return store.get();
}

function save(mutator: (data: Data) => void): void {
  store.update(mutator);
}

function requireGroup(id: string): Group {
  const group = data().groups[id];
  if (!group) throw new GroupError('Group not found.', 404);
  return group;
}

export function requireMember(group: Group, accountId: string): void {
  if (!group.memberAccountIds.includes(accountId)) {
    throw new GroupError('You need to be a member of this group first.', 403);
  }
}

export function createGroup(name: string, ownerAccountId: string): Group {
  const trimmed = name.trim().slice(0, 60);
  if (!trimmed) throw new GroupError('Group name is required.', 400);

  let joinCode = newJoinCode();
  while (Object.values(data().groups).some((g) => g.joinCode === joinCode)) joinCode = newJoinCode();

  const group: Group = {
    id: newId(),
    name: trimmed,
    joinCode,
    ownerAccountId,
    memberAccountIds: [ownerAccountId],
    createdAt: Date.now(),
  };
  save((d) => {
    d.groups[group.id] = group;
  });
  return group;
}

export function joinGroup(joinCode: string, accountId: string): Group {
  const code = joinCode.trim().toUpperCase();
  const group = Object.values(data().groups).find((g) => g.joinCode === code);
  if (!group) throw new GroupError(`No group found for code "${code}".`, 404);

  if (!group.memberAccountIds.includes(accountId)) {
    save((d) => {
      d.groups[group.id]!.memberAccountIds.push(accountId);
    });
  }
  return requireGroup(group.id);
}

export function getGroup(id: string): Group {
  return requireGroup(id);
}

export function groupsForAccount(accountId: string): Group[] {
  return Object.values(data().groups)
    .filter((g) => g.memberAccountIds.includes(accountId))
    .sort((a, b) => b.createdAt - a.createdAt);
}
