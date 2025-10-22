<script setup lang="ts">
import { computed } from "vue";
import { useToast, type ToastState } from "@/composables/useToast";
import { X } from "lucide-vue-next";

const { toasts, dismiss } = useToast();

const variantClasses = computed(() => {
  const palette: Record<string, string> = {
    default: "bg-card/90 text-card-foreground border border-border backdrop-blur",
    success: "bg-emerald-500/90 text-white border border-emerald-400/60 shadow-lg",
    destructive: "bg-destructive text-destructive-foreground border border-destructive/80 shadow-lg",
  };
  return (toast: ToastState) => palette[toast.variant ?? "default"] ?? palette.default;
});
</script>

<template>
  <div class="pointer-events-none fixed inset-0 flex flex-col items-end justify-start px-4 py-6 sm:p-6">
    <TransitionGroup tag="div" name="toast" class="flex w-full flex-col gap-3 sm:max-w-sm">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full items-start gap-3 rounded-lg px-4 py-3 shadow-lg transition-all"
        :class="variantClasses(toast)"
      >
        <div class="flex flex-1 flex-col">
          <p v-if="toast.title" class="text-sm font-semibold">
            {{ toast.title }}
          </p>
          <p v-if="toast.description" class="text-sm opacity-90">
            {{ toast.description }}
          </p>
        </div>
        <button
          type="button"
          class="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent text-xs text-current transition hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          @click="dismiss(toast.id)"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
