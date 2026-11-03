import '@fontsource-variable/geist';
import './lib/styles/tokens.css';
import './lib/styles/base.css';
import './lib/styles/motion.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initApi } from './lib/api';

await initApi();

mount(App, { target: document.getElementById('app')! });
