import type { TripFields } from "./types.js";
import { fieldsEqual } from "./trip-rules.js";

export type AsyncOpContext = {
  sessionGeneration: number;
  editorGeneration: number;
  draftId: string;
  operationId: number;
  expectedRevision: number;
  editVersionAtDispatch: number;
  localAtDispatch: TripFields;
  savedAtDispatch: TripFields;
};

/** Three-way merge: preserve human edits since dispatch; take server values elsewhere. */
export function mergeAfterInFlightEdit(input: {
  savedAtDispatch: TripFields;
  localAtDispatch: TripFields;
  localNow: TripFields;
  serverFields: TripFields;
}): { localFields: TripFields; dirty: boolean; overlapped: Array<keyof TripFields> } {
  const overlapped: Array<keyof TripFields> = [];
  const localFields: TripFields = { ...input.serverFields };
  (Object.keys(input.serverFields) as Array<keyof TripFields>).forEach((key) => {
    const humanChanged = input.localNow[key] !== input.localAtDispatch[key];
    const serverChanged = input.serverFields[key] !== input.savedAtDispatch[key];
    if (humanChanged) {
      localFields[key] = input.localNow[key] as never;
      if (serverChanged && input.serverFields[key] !== input.localNow[key]) {
        overlapped.push(key);
      }
    }
  });
  return {
    localFields,
    dirty: !fieldsEqual(localFields, input.serverFields),
    overlapped,
  };
}

export function isStaleOp(
  ctx: AsyncOpContext,
  current: {
    sessionGeneration: number;
    editorGeneration: number;
    draftId: string | null;
    activeOperationId: number | null;
  },
): boolean {
  if (ctx.sessionGeneration !== current.sessionGeneration) return true;
  if (ctx.editorGeneration !== current.editorGeneration) return true;
  if (!current.draftId || ctx.draftId !== current.draftId) return true;
  return false;
}
