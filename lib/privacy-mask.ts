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

const ALIAS_LABELS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

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
  const label = ALIAS_LABELS[index] ?? `participant${index + 1}`;
  return `\uFF5B${label}\u3055\u3093\uFF5D`;
}
