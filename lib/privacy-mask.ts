type Participant = {
  id?: string | null;
  displayName: string;
  email?: string | null;
};

export type MaskedParticipant = {
  alias: string;
  required: boolean;
};

export type ParticipantMask = {
  original: Participant;
  alias: string;
};

export type ParticipantMaskContext = {
  masks: ParticipantMask[];
  maskedParticipants: MaskedParticipant[];
};

const ALIAS_NAMES = [
  "Aさん",
  "Bさん",
  "Cさん",
  "Dさん",
  "Eさん",
  "Fさん",
  "Gさん",
  "Hさん",
  "Iさん",
  "Jさん",
];

export function createParticipantMaskContext(participants: Participant[]): ParticipantMaskContext {
  const masks = participants.map((participant, index) => ({
    original: participant,
    alias: toAlias(index),
  }));

  return {
    masks,
    maskedParticipants: masks.map((mask) => ({
      alias: mask.alias,
      required: true,
    })),
  };
}

export function maskParticipantText(value: string, context: ParticipantMaskContext) {
  return context.masks.reduce((masked, mask) => {
    const replacements = [mask.original.displayName, `@${mask.original.displayName}`, mask.original.email ?? ""]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);

    return replacements.reduce((current, target) => current.replaceAll(target, mask.alias), masked);
  }, value);
}

export function unmaskParticipantText(value: string, context: ParticipantMaskContext) {
  return context.masks.reduce((unmasked, mask) => unmasked.replaceAll(mask.alias, mask.original.displayName), value);
}

export function restoreParticipants(context: ParticipantMaskContext) {
  return context.masks.map((mask) => ({
    id: mask.original.id ?? null,
    displayName: mask.original.displayName,
    email: mask.original.email ?? null,
    required: true,
  }));
}

function toAlias(index: number) {
  return `｛${ALIAS_NAMES[index] ?? `参加者${index + 1}`}｝`;
}
