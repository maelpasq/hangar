import '@fontsource-variable/geist';
import './lib/styles/tokens.css';
import './lib/styles/base.css';
import './lib/styles/motion.css';
import { mount } from 'svelte';
import App from './App.svelte';
import TrayMenu from './TrayMenu.svelte';
import LinuxBlocked from './lib/screens/LinuxBlocked.svelte';
import { initApi } from './lib/api';
import { isLinux } from './lib/util/platform';

// Linux : WebKitGTK refait chaque flou d'arrière-plan à chaque image, base.css les retire (classe `linux`).
if (isLinux) document.documentElement.classList.add('linux');

await initApi();

// Version Linux désactivée : seulement l'écran de blocage (`?linux` pour le voir avec dev:web).
const linuxOff = isLinux || (import.meta.env.DEV && new URLSearchParams(location.search).has('linux'));

// La même page sert la fenêtre principale et le menu de l'icône (index.html#tray).
const root = linuxOff ? LinuxBlocked : location.hash === '#tray' ? TrayMenu : App;
mount(root, { target: document.getElementById('app')! });
