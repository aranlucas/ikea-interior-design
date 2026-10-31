import { type ImageSettings } from "../lib/image-settings";
import { useForm, useWatch } from "react-hook-form";
import type { Room } from "../lib/types";
import { useStudioData } from "../lib/studio-data";

export function useRoomDrafts(
  room: Pick<Room, "id" | "notes" | "style" | "imageSettings"> | undefined,
  onError: (message: string) => void,
) {
  const { saveDraft, draftForm } = useStudioData();
  const editor = draftForm(room || { id: "", notes: "", style: "" });
  const { register, getValues, setValue } = useForm({ formControl: editor.formControl });
  const imageSettings = useWatch({ control: editor.control, name: "imageSettings" });
  const saveStatus = useWatch({ control: editor.control, name: "status" });
  async function save() {
    if (!room) return;
    const revision = ++editor.revision;
    setValue("status", "Saving…");
    try {
      await saveDraft(room.id, getValues()).when("settled");
      if (editor.revision === revision) setValue("status", "Saved");
    } catch (error) {
      if (editor.revision !== revision) return;
      setValue("status", "");
      onError(error instanceof Error ? error.message : "Could not save room.");
    }
  }
  return {
    draftFields: {
      notes: {
        ...register("notes", { onChange: () => void save() }),
        defaultValue: getValues("notes"),
      },
      style: {
        ...register("style", { onChange: () => void save() }),
        defaultValue: getValues("style"),
      },
    },
    imageSettings,
    setImageSettings: (value: ImageSettings) => {
      setValue("imageSettings", value);
      void save();
    },
    getDraft: getValues,
    saveStatus,
  };
}
