import '@fontsource-variable/geist';
import '../../src/lib/styles/tokens.css';
import './style.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
