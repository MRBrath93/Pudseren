import { createRouter, createWebHistory } from 'vue-router';
import { useAuth } from '../composables/useAuth.js';

// Siderne indlæses først, når de bruges (lazy loading), så medarbejderens telefon
// ikke henter chefens sider og omvendt.
const ComingSoon = () => import('../views/ComingSoonView.vue');

const routes = [
  { path: '/login', component: () => import('../views/LoginView.vue'), meta: { guest: true } },
  {
    // Chefens sider deler navigationsrail'en i ChefLayout.
    path: '/',
    component: () => import('../components/templates/ChefLayout.vue'),
    meta: { roles: ['chef'] },
    children: [
      { path: '', redirect: '/skal-pudses' },
      { path: 'skal-pudses', component: () => import('../views/ChefHomeView.vue') },
      { path: 'ruter', component: ComingSoon, props: { title: 'Ruter' } },
      { path: 'kunder', component: ComingSoon, props: { title: 'Kunder' } },
      { path: 'hold', component: ComingSoon, props: { title: 'Hold' } },
    ],
  },
  { path: '/dagens-rute', component: () => import('../views/WorkerHomeView.vue'), meta: { roles: ['medarbejder'] } },
  { path: '/to-faktor', component: () => import('../views/TwoFactorSetupView.vue'), meta: { roles: ['chef', 'medarbejder'] } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Beskytter siderne efter rolle. Serveren tjekker også rollen på hvert API-kald,
// så dette er for brugervenlighed – ikke sikkerheden i sig selv.
router.beforeEach(async (to) => {
  const auth = useAuth();
  if (!auth.loaded.value) await auth.fetchMe();
  const user = auth.user.value;

  // Det mest sandsynlige først: en logget ind bruger på en side, han har adgang til.
  if (user && to.meta.roles?.includes(user.role)) {
    if (auth.needsTwoFactorSetup.value && to.path !== '/to-faktor') return '/to-faktor';
    return true;
  }
  if (to.meta.guest) return user ? auth.homeRoute.value : true;
  if (!user) return '/login';
  return auth.homeRoute.value;
});

export default router;
