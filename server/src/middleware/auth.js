// Kræver at brugeren er logget ind.
export function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.status(401).json({ error: 'Du skal være logget ind.' });
}

// Kræver en bestemt rolle, fx requireRole('chef').
export function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session.user;
    if (user && roles.includes(user.role)) return next();
    if (!user) return res.status(401).json({ error: 'Du skal være logget ind.' });
    res.status(403).json({ error: 'Du har ikke adgang til dette.' });
  };
}

// Ændringer (POST, PUT, PATCH) skal sendes som JSON. Sammen med SameSite=Strict-cookien
// gør det, at andre hjemmesider ikke kan sende forespørgsler i brugerens navn (CSRF):
// en almindelig HTML-formular på en fremmed side kan ikke sende JSON.
export function requireJson(req, res, next) {
  const changesData = req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';
  if (!changesData || req.is('application/json')) return next();
  res.status(415).json({ error: 'Forespørgslen skal sendes som JSON.' });
}
