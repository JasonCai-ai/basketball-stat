<template>
  <router-view :key="$route.path" />
</template>

<script setup>
// No need for component imports or setup code here anymore
// The router will handle which view to display
</script>

<style>
@import './assets/main.css';
</style>
