<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, useRoute } from "vue-router";

const route = useRoute();

onMounted(() => {
  console.error("404 Error: User attempted to access non-existent route:", route.fullPath);
});
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
    <div class="text-center">
      <h1 class="mb-4 text-4xl font-bold text-gray-900">404</h1>
      <p class="mb-4 text-xl text-gray-600">Oops! Page not found</p>
      <RouterLink
        to="/"
        class="font-semibold text-blue-600 underline transition hover:text-blue-700"
      >
        Return to Home
      </RouterLink>
    </div>
  </div>
</template>
