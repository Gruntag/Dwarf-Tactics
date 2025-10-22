import { computed, onUnmounted, ref, type Ref } from "vue";

export type ToastVariant = "default" | "success" | "destructive";

export interface ToastOptions {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface ToastState extends ToastOptions {
  id: string;
  createdAt: number;
}

const DEFAULT_DURATION = 4000;
const MAX_TOASTS = 3;

const toasts: Ref<ToastState[]> = ref([]);
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
let seed = 0;

const clearTimeoutFor = (id: string) => {
  const timeout = timeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    timeouts.delete(id);
  }
};

const scheduleRemoval = (toast: ToastState) => {
  const duration = toast.duration ?? DEFAULT_DURATION;
  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }

  const timeout = setTimeout(() => {
    dismiss(toast.id);
  }, duration);

  timeouts.set(toast.id, timeout);
};

export const toast = (options: ToastOptions) => {
  const id = options.id ?? `toast-${++seed}`;
  const next: ToastState = {
    ...options,
    id,
    createdAt: Date.now(),
  };

  clearTimeoutFor(id);

  toasts.value = [next, ...toasts.value.filter((item) => item.id !== id)].slice(0, MAX_TOASTS);
  scheduleRemoval(next);

  return {
    id,
    dismiss: () => dismiss(id),
  };
};

export const dismiss = (id?: string) => {
  if (!id) {
    toasts.value.forEach((item) => clearTimeoutFor(item.id));
    toasts.value = [];
    return;
  }

  clearTimeoutFor(id);
  toasts.value = toasts.value.filter((item) => item.id !== id);
};

export const useToast = () => {
  const snapshot = computed(() => toasts.value);

  onUnmounted(() => {
    snapshot.value.forEach((item) => clearTimeoutFor(item.id));
  });

  return {
    toasts: snapshot,
    toast,
    dismiss,
  };
};
