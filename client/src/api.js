// Lille hjælper til kald mod Express-API'et.
// Session-cookien sendes automatisk med, fordi klient og API ligger på samme adresse.

export class ApiError extends Error {
  constructor(status, message, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(method, path, body) {
  const options = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    // Ændringer sendes altid som JSON – serveren afviser andet (beskyttelse mod CSRF).
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError(0, 'Ingen forbindelse til serveren.');
  }

  // Det mest sandsynlige først: et svar med indhold, der gik godt.
  if (response.ok && response.status !== 204) return response.json();
  if (response.ok) return null;

  const data = await response.json().catch(() => ({}));
  throw new ApiError(response.status, data.error ?? 'Noget gik galt.', data);
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body = {}) => request('POST', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};
