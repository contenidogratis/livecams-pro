(() => {
  'use strict';

  // Cambia solo estos valores si más adelante mueves o amplías tu Worker.
  const CONFIG = {
    apiUrl: 'https://quiet-violet-5390.javiercfds.workers.dev',
    refreshEveryMs: 90_000,
    maxModels: 24,
    requestTimeoutMs: 15_000,
    affiliateCode: '840433'
  };

  const container = document.querySelector('#modelos');

  if (!container) {
    console.warn('LiveCams Pro: no se encontró el contenedor #modelos.');
    return;
  }

  let refreshTimer;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  function firstValue(object, names, fallback = '') {
    for (const name of names) {
      const value = object?.[name];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  // Acepta tanto un array directo como respuestas tipo { models: [...] } o { data: [...] }.
  function getModels(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const likelyLists = ['models', 'data', 'results', 'performers', 'items', 'online_models'];
    for (const key of likelyLists) {
      if (Array.isArray(payload[key])) return payload[key];
    }

    const nested = Object.values(payload).find(Array.isArray);
    return nested || [];
  }

  function modelLink(model) {
    const suppliedUrl = firstValue(model, [
      'url', 'link', 'profile_page_url', 'profilePageUrl', 'profile_url', 'profileUrl', 'room_url', 'roomUrl'
    ]);
    if (suppliedUrl) return suppliedUrl;

    const username = firstValue(model, ['username', 'user_name', 'name', 'nickname', 'model_name', 'modelName']);
    // Si tu Worker no devuelve una URL, adapta esta ruta al programa de afiliados que uses.
    return username
      ? `https://bngprm.com/?c=${encodeURIComponent(CONFIG.affiliateCode)}&m=${encodeURIComponent(username)}`
      : `https://bngprm.com/?c=${encodeURIComponent(CONFIG.affiliateCode)}`;
  }

  function modelMedia(model, name) {
    // El Worker de Bonga devuelve las fotos dentro de profile_images.
    const images = model?.profile_images || model?.profileImages || {};
    const image = firstValue({ ...images, ...model }, [
      'profile_image', 'profileImage', 'thumbnail_image_medium', 'thumbnailImageMedium',
      'thumbnail_image_small', 'thumbnailImageSmall', 'image_url', 'imageUrl', 'image',
      'thumbnail_url', 'thumbnailUrl', 'thumbnail', 'preview_url', 'previewUrl', 'avatar_url', 'avatarUrl', 'photo'
    ]);
    const video = firstValue(model, ['video_url', 'videoUrl', 'preview_video', 'previewVideo']);

    /*
     * SECCIÓN DE VÍDEO:
     * Si tu Worker envía una URL compatible en video_url, se mostrará aquí.
     * Si Bonga u otro proveedor bloquea la reproducción directa, deja esta parte
     * como está: se usará la miniatura y el botón llevará a la sala de la modelo.
     */
    if (video) {
      return `<video class="modelo-media" muted loop playsinline preload="metadata" poster="${escapeHtml(image)}">
        <source src="${escapeHtml(video)}" type="video/mp4">
      </video>`;
    }

    if (image) {
      return `<img class="modelo-media" src="${escapeHtml(image)}" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer">`;
    }

    return '<div class="modelo-media modelo-sin-imagen" aria-label="Sin imagen disponible">📹</div>';
  }

  function modelCard(model) {
    const name = firstValue(model, ['username', 'user_name', 'name', 'nickname', 'model_name', 'modelName'], 'Modelo en vivo');
    const location = firstValue(model, ['location', 'country', 'country_name', 'countryName']);
    const viewers = firstValue(model, ['viewers', 'viewer_count', 'viewerCount', 'num_users', 'users']);
    const topic = firstValue(model, ['topic', 'description', 'room_subject', 'roomSubject']);
    const details = [location, viewers !== '' ? `${viewers} viendo` : ''].filter(Boolean).join(' · ');
    const link = modelLink(model);

    return `<article class="modelo-card">
      <a class="modelo-preview" href="${escapeHtml(link)}" target="_blank" rel="noopener sponsored" aria-label="Entrar a la sala de ${escapeHtml(name)}">
        ${modelMedia(model, name)}
        <span class="modelo-live"><span></span> EN VIVO</span>
      </a>
      <div class="modelo-info">
        <h3>${escapeHtml(name)}</h3>
        ${topic ? `<p class="modelo-topic">${escapeHtml(topic)}</p>` : ''}
        ${details ? `<p class="modelo-details">${escapeHtml(details)}</p>` : ''}
        <a class="modelo-button" href="${escapeHtml(link)}" target="_blank" rel="noopener sponsored">Entrar ahora</a>
      </div>
    </article>`;
  }

  function showLoading() {
    container.setAttribute('aria-busy', 'true');
    container.innerHTML = '<p class="modelos-status">Cargando modelos en vivo…</p>';
  }

  function showError(message) {
    container.setAttribute('aria-busy', 'false');
    container.innerHTML = `<div class="modelos-status modelos-error" role="alert">
      <p>No se pudieron cargar las modelos ahora mismo.</p>
      <button type="button" class="modelos-retry">Reintentar</button>
      <small>${escapeHtml(message)}</small>
    </div>`;
    container.querySelector('.modelos-retry')?.addEventListener('click', loadModels);
  }

  function showModels(models) {
    container.setAttribute('aria-busy', 'false');
    if (!models.length) {
      container.innerHTML = '<p class="modelos-status">No hay modelos disponibles en este momento. Vuelve a intentarlo en unos minutos.</p>';
      return;
    }

    container.innerHTML = models.slice(0, CONFIG.maxModels).map(modelCard).join('');
    container.querySelectorAll('video.modelo-media').forEach(video => {
      video.addEventListener('mouseenter', () => video.play().catch(() => {}));
      video.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
    });
  }

  async function loadModels() {
    clearTimeout(refreshTimer);
    showLoading();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.requestTimeoutMs);

    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`El servidor respondió con ${response.status}.`);

      const payload = await response.json();
      showModels(getModels(payload));
    } catch (error) {
      const message = error.name === 'AbortError'
        ? 'La solicitud tardó demasiado tiempo.'
        : (error.message || 'Error de conexión.');
      console.error('LiveCams Pro:', error);
      showError(message);
    } finally {
      clearTimeout(timeout);
      refreshTimer = setTimeout(loadModels, CONFIG.refreshEveryMs);
    }
  }

  loadModels();
})();
// ===== Panel de categorías =====
const btnCategorias = document.getElementById("btnCategorias");
const panelCategorias = document.getElementById("panelCategorias");
const cerrarCategorias = document.getElementById("cerrarCategorias");
const overlayCategorias = document.getElementById("overlayCategorias");

if (btnCategorias) {

    btnCategorias.onclick = () => {
        panelCategorias.classList.add("activo");
        overlayCategorias.classList.add("activo");
    };

    cerrarCategorias.onclick = () => {
        panelCategorias.classList.remove("activo");
        overlayCategorias.classList.remove("activo");
    };

    overlayCategorias.onclick = () => {
        panelCategorias.classList.remove("activo");
        overlayCategorias.classList.remove("activo");
    };

}
