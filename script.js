/* =========================================================
     ALUMA — LÓGICA DE CLIENTE
     ========================================================= */

  /* =========================================================
     ALUMA — SITIO ESTÁTICO (GitHub Pages / Netlify)
     Esta versión NO usa google.script.run (eso solo funciona si la
     página se sirve directamente desde script.google.com). Aquí la
     página vive en tu propio hosting y llama a Apps Script solo como
     una API en segundo plano, con fetch().
     ========================================================= */

  // ⚠️ IMPORTANTE: reemplaza esto por el link real de tu Web App de Apps Script
  // (el que termina en /exec). Debes volver a implementarla después de
  // actualizar Code.gs para que entienda estas llamadas de API.
  var EXEC_URL = 'https://script.google.com/macros/s/AKfycbxNehJ3DC5k8hfvgKas3mExKkz_xe-X9llOVSrQbYm0oBp_n7YsEDyaAGqLbiNHPIZr/exec';

  function llamarApiLectura(accion, onExito, onError) {
    fetch(EXEC_URL + '?api=' + encodeURIComponent(accion))
      .then(function (r) { return r.json(); })
      .then(onExito)
      .catch(function () {
        // Si fetch falla (por ejemplo, por una restricción de CORS),
        // reintentamos automáticamente con JSONP como respaldo.
        llamarApiLecturaJSONP(accion, onExito, onError);
      });
  }

  var contadorJSONP = 0;
  function llamarApiLecturaJSONP(accion, onExito, onError) {
    var nombreCallback = 'alumaCallback' + (contadorJSONP++);
    var script = document.createElement('script');

    window[nombreCallback] = function (datos) {
      delete window[nombreCallback];
      script.remove();
      onExito(datos);
    };

    script.src = EXEC_URL + '?api=' + encodeURIComponent(accion) + '&callback=' + nombreCallback;
    script.onerror = function () {
      delete window[nombreCallback];
      script.remove();
      if (onError) onError(new Error('No se pudo conectar con la tienda'));
    };
    document.body.appendChild(script);
  }

  function llamarApiEscritura(accion, datos, onExito, onError) {
    datos = datos || {};
    datos.api = accion;
    fetch(EXEC_URL, {
      method: 'POST',
      // text/plain evita que el navegador dispare una solicitud "preflight" (OPTIONS),
      // que Apps Script no responde correctamente. Apps Script igual lee el JSON bien.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(datos)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (onExito) onExito(res); })
      .catch(function (err) { if (onError) onError(err); });
  }

  var ESTADO = {
    productos: [],
    categorias: [],
    banners: [],
    config: {},
    opiniones: [],
    carrito: JSON.parse(localStorage.getItem('aluma_carrito') || '[]'),
    favoritos: JSON.parse(localStorage.getItem('aluma_favoritos') || '[]'),
    categoriaActiva: 'Todos',
    indiceSlide: 0,
    productoActual: null,
    colorSeleccionado: '',
    cantidadSeleccionada: 1,
    entregaSeleccionada: '',
    pagoSeleccionado: ''
  };

  document.getElementById('anio-actual').textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     CARGA INICIAL
     --------------------------------------------------------- */
  window.onload = function () {
    llamarApiLectura('datos', cargarDatos, errorCarga);
    document.addEventListener('scroll', manejarScroll);
    observarAnimaciones();
    interceptarEnlacesInternos();
    renderSelectorEstrellas();
  };

  /* Evita que los enlaces tipo #tienda, #inicio, #, etc. recarguen toda la
     página (lo que causaba la pantalla en blanco). En su lugar, hacen scroll
     suave hasta la sección correspondiente. */
  function interceptarEnlacesInternos() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      e.preventDefault();
      var id = link.getAttribute('href').slice(1);
      if (id) {
        var destino = document.getElementById(id);
        if (destino) destino.scrollIntoView({ behavior: 'smooth' });
      }
      cerrarMenuMovil();
    });
  }

  function errorCarga(err) {
    document.getElementById('grid-productos').innerHTML =
      '<p class="cargando">No se pudo cargar la tienda. Verifica que las hojas de Google Sheets existan y vuelve a intentar.</p>';
    console.error(err);
  }

  function cargarDatos(datos) {
    ESTADO.productos = datos.productos || [];
    ESTADO.categorias = datos.categorias || [];
    ESTADO.banners = datos.banners || [];
    ESTADO.config = datos.configuracion || {};
    ESTADO.opiniones = datos.opiniones || [];

    aplicarConfiguracion();
    renderHero();
    renderCategorias();
    renderFiltros();
    renderGrillas();
    renderResenas();
    renderInstagram();
    actualizarBadges();
  }

  function aplicarConfiguracion() {
    var c = ESTADO.config;
    if (c.NombreTienda) document.querySelectorAll('.logo').forEach(function (el) { el.textContent = c.NombreTienda; });
    if (c.TextoFooter) document.getElementById('footer-descripcion').textContent = c.TextoFooter;
    if (c.Telefono) document.getElementById('footer-telefono').textContent = c.Telefono;
    if (c.Email) document.getElementById('footer-correo').textContent = c.Email;
    if (c.Direccion) document.getElementById('footer-direccion').textContent = c.Direccion;
    if (c.InstagramURL) document.getElementById('link-instagram').href = c.InstagramURL;
    if (c.FacebookURL) document.getElementById('link-facebook').href = c.FacebookURL;
    if (c.TikTokURL) document.getElementById('link-tiktok').href = c.TikTokURL;
    if (c.TextoAnuncio) document.getElementById('barra-anuncio').textContent = c.TextoAnuncio;
    if (c.TextoSobreNosotros) document.getElementById('texto-nosotros').textContent = c.TextoSobreNosotros;

    var numero = obtenerNumeroWhatsApp();
    var enlace = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(
      c.MensajeBienvenidaWhatsApp || 'Hola, quiero saber mas sobre los accesorios de Aluma.'
    );
    document.getElementById('btn-whatsapp-flotante').href = enlace;
  }

  function obtenerNumeroWhatsApp() {
    var n = (ESTADO.config.WhatsAppNumero || '573026040162').toString();
    return n.replace(/[^0-9]/g, '');
  }

  function formatearPrecio(valor) {
    return '$' + Math.round(valor).toLocaleString('es-CO');
  }

  /**
   * Convierte automáticamente un link de "Compartir" de Google Drive
   * (ej: https://drive.google.com/file/d/XXXX/view?usp=sharing) al formato
   * que sí se puede mostrar como imagen dentro de la web. Si el link ya es
   * de otro sitio (o ya viene en formato directo), lo deja igual.
   */
  function urlImagen(url) {
    if (!url) return '';
    url = String(url).trim();
    var match = url.match(/drive\.google\.com\/file\/d\/([-\w]{20,})/);
    if (match) return 'https://lh3.googleusercontent.com/d/' + match[1] + '=w1000';
    match = url.match(/drive\.google\.com\/open\?id=([-\w]{20,})/);
    if (match) return 'https://lh3.googleusercontent.com/d/' + match[1] + '=w1000';
    match = url.match(/[?&]id=([-\w]{20,})/);
    if (match && url.indexOf('drive.google.com') > -1) return 'https://lh3.googleusercontent.com/d/' + match[1] + '=w1000';
    return url;
  }

  /* ---------------------------------------------------------
     HERO / SLIDER
     --------------------------------------------------------- */
  function renderHero() {
    var cont = document.getElementById('hero-slides');
    var dots = document.getElementById('hero-dots');
    cont.innerHTML = '';
    dots.innerHTML = '';

    var banners = ESTADO.banners.length ? ESTADO.banners : [{
      titulo: ESTADO.config.NombreTienda || 'Aluma',
      subtitulo: ESTADO.config.Eslogan || 'Accesorios que cuentan tu historia',
      imagen: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1600',
      botonTexto: 'Ver tienda', botonLink: '#tienda'
    }];

    banners.forEach(function (b, i) {
      var slide = document.createElement('div');
      slide.className = 'hero-slide' + (i === 0 ? ' activa' : '');
      slide.style.backgroundImage = "url('" + urlImagen(b.imagen) + "')";
      slide.innerHTML =
        '<div class="hero-texto">' +
          '<p class="eyebrow">Colección Aluma</p>' +
          '<h1>' + escapeHTML(b.titulo) + '</h1>' +
          '<p>' + escapeHTML(b.subtitulo || '') + '</p>' +
          '<a href="' + (b.botonLink || '#tienda') + '" class="btn btn-claro">' + escapeHTML(b.botonTexto || 'Ver colección') + '</a>' +
        '</div>';
      cont.appendChild(slide);

      var dot = document.createElement('span');
      if (i === 0) dot.className = 'activa';
      dot.onclick = function () { irASlide(i); };
      dots.appendChild(dot);
    });

    if (banners.length > 1) {
      setInterval(function () { irASlide((ESTADO.indiceSlide + 1) % banners.length); }, 6000);
    }
  }

  function irASlide(i) {
    var slides = document.querySelectorAll('.hero-slide');
    var dots = document.querySelectorAll('.hero-dots span');
    slides.forEach(function (s, idx) { s.classList.toggle('activa', idx === i); });
    dots.forEach(function (d, idx) { d.classList.toggle('activa', idx === i); });
    ESTADO.indiceSlide = i;
  }

  /* ---------------------------------------------------------
     CATEGORÍAS
     --------------------------------------------------------- */
  function renderCategorias() {
    var cont = document.getElementById('grid-categorias');
    cont.innerHTML = '';
    ESTADO.categorias.forEach(function (c) {
      var div = document.createElement('a');
      div.href = '#tienda';
      div.className = 'tarjeta-categoria';
      div.onclick = function () { filtrarPorCategoria(c.nombre); };
      div.innerHTML = '<img src="' + urlImagen(c.imagen) + '" alt="' + escapeHTML(c.nombre) + '" loading="lazy"><span>' + escapeHTML(c.nombre) + '</span>';
      cont.appendChild(div);
    });
  }

  function renderFiltros() {
    var cont = document.getElementById('filtros-categoria');
    var nombres = ['Todos'].concat(ESTADO.categorias.map(function (c) { return c.nombre; }));
    cont.innerHTML = '';
    nombres.forEach(function (n) {
      var chip = document.createElement('button');
      chip.className = 'chip-filtro' + (n === ESTADO.categoriaActiva ? ' activo' : '');
      chip.textContent = n;
      chip.onclick = function () { filtrarPorCategoria(n); };
      cont.appendChild(chip);
    });
  }

  function normalizarTexto(t) {
    return String(t || '').trim().toLowerCase();
  }

  function filtrarPorCategoria(nombre) {
    ESTADO.categoriaActiva = nombre;
    renderFiltros();
    var lista = nombre === 'Todos'
      ? ESTADO.productos
      : ESTADO.productos.filter(function (p) { return normalizarTexto(p.categoria) === normalizarTexto(nombre); });
    pintarGrilla('grid-productos', lista);
    document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------------------------------------------------------
     GRILLAS DE PRODUCTOS
     --------------------------------------------------------- */
  function renderGrillas() {
    pintarGrilla('grid-productos', ESTADO.productos);
    pintarGrilla('grid-novedades', ESTADO.productos.filter(function (p) { return p.nuevo; }).slice(0, 8));
    pintarGrilla('grid-vendidos', ESTADO.productos.filter(function (p) { return p.masVendido; }).slice(0, 8));
    pintarGrilla('grid-ofertas', ESTADO.productos.filter(function (p) { return p.precioAnterior > p.precio; }).slice(0, 8));
  }

  function pintarGrilla(idContenedor, lista) {
    var cont = document.getElementById(idContenedor);
    if (!cont) return;
    if (!lista.length) {
      cont.innerHTML = '<p class="cargando">Aún no hay productos para mostrar aquí.</p>';
      return;
    }
    cont.innerHTML = lista.map(tarjetaProductoHTML).join('');
  }

  function estaAgotado(p) {
    return !p.disponible || p.stock <= 0;
  }

  function tarjetaProductoHTML(p) {
    var esFav = ESTADO.favoritos.indexOf(p.id) > -1;
    var agotado = estaAgotado(p);
    var etiqueta = '';
    if (agotado) {
      etiqueta = '<span class="etiqueta agotado">Agotado</span>';
    } else if (p.precioAnterior > p.precio) {
      var descuento = Math.round((1 - p.precio / p.precioAnterior) * 100);
      etiqueta = '<span class="etiqueta oferta">-' + descuento + '%</span>';
    } else if (p.nuevo) {
      etiqueta = '<span class="etiqueta">Nuevo</span>';
    }
    return (
      '<div class="tarjeta-producto fade-in visible' + (agotado ? ' agotado' : '') + '">' +
        '<div class="imagen-wrap" onclick="abrirProducto(\'' + p.id + '\')">' +
          etiqueta +
          '<button class="fav-btn ' + (esFav ? 'activo' : '') + '" onclick="event.stopPropagation(); alternarFavorito(\'' + p.id + '\')">' + iconoCorazon() + '</button>' +
          '<img src="' + urlImagen(p.imagen) + '" alt="' + escapeHTML(p.nombre) + '" loading="lazy">' +
          '<div class="acciones-hover">' +
            '<button onclick="event.stopPropagation(); abrirProducto(\'' + p.id + '\')">Ver detalle</button>' +
          '</div>' +
        '</div>' +
        '<div class="info-producto" onclick="abrirProducto(\'' + p.id + '\')">' +
          '<p class="cat">' + escapeHTML(p.categoria) + '</p>' +
          '<h3>' + escapeHTML(p.nombre) + '</h3>' +
          '<div class="precios">' +
            '<span class="precio-actual">' + formatearPrecio(p.precio) + '</span>' +
            (p.precioAnterior > p.precio ? '<span class="precio-anterior">' + formatearPrecio(p.precioAnterior) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ---------------------------------------------------------
     BÚSQUEDA
     --------------------------------------------------------- */
  var temporizadorBusqueda;
  function buscarProductos(texto) {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(function () {
      var q = texto.trim().toLowerCase();
      if (!q) { pintarGrilla('grid-productos', ESTADO.productos); return; }
      var resultado = ESTADO.productos.filter(function (p) {
        return (p.nombre + ' ' + p.categoria + ' ' + p.material).toLowerCase().indexOf(q) > -1;
      });
      document.getElementById('tienda').scrollIntoView({ behavior: 'smooth' });
      pintarGrilla('grid-productos', resultado);
    }, 250);
  }

  function alternarBuscador() {
    document.getElementById('barra-buscar').classList.toggle('activa');
    document.getElementById('input-buscar').focus();
  }

  /* ---------------------------------------------------------
     MODAL DE PRODUCTO
     --------------------------------------------------------- */
  function abrirProducto(id) {
    var p = ESTADO.productos.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    ESTADO.productoActual = p;
    ESTADO.colorSeleccionado = p.colores[0] || '';
    ESTADO.cantidadSeleccionada = 1;
    var agotado = estaAgotado(p);

    var galeria = (p.galeria.length ? p.galeria : [p.imagen]).map(urlImagen);

    var htmlColores = p.colores.map(function (c, i) {
      return '<div class="swatch ' + (i === 0 ? 'activo' : '') + '" style="background:' + colorACSS(c) + '" title="' + escapeHTML(c) + '" onclick="seleccionarColor(this, \'' + c.replace(/'/g, "") + '\')"></div>';
    }).join('');

    var htmlMiniaturas = galeria.map(function (img, i) {
      return '<img src="' + img + '" class="' + (i === 0 ? 'activa' : '') + '" onclick="cambiarImagenPrincipal(this, \'' + img + '\')">';
    }).join('');

    document.getElementById('contenido-producto').innerHTML =
      '<div class="modal-grid">' +
        '<div>' +
          '<div class="galeria-principal" onmousemove="zoomImagen(event)" onmouseleave="resetZoom()" onclick="abrirLightbox()"><img id="imagen-principal-modal" src="' + galeria[0] + '"></div>' +
          '<div class="galeria-miniaturas">' + htmlMiniaturas + '</div>' +
          (p.video ? '<div style="padding:0 16px 16px;"><iframe width="100%" height="220" src="' + convertirVideoEmbebido(p.video) + '" frameborder="0" allowfullscreen style="border-radius:4px;"></iframe></div>' : '') +
        '</div>' +
        '<div class="modal-info">' +
          '<p class="cat">' + escapeHTML(p.categoria) + ' · ' + escapeHTML(p.material) + '</p>' +
          '<h2>' + escapeHTML(p.nombre) + '</h2>' +
          '<div class="precios">' +
            '<span class="precio-actual">' + formatearPrecio(p.precio) + '</span>' +
            (p.precioAnterior > p.precio ? '<span class="precio-anterior">' + formatearPrecio(p.precioAnterior) + '</span>' : '') +
          '</div>' +
          '<p class="descripcion">' + escapeHTML(p.descripcion) + '</p>' +
          (p.colores.length ? '<p class="selector-titulo">Color: <span id="texto-color-elegido">' + escapeHTML(p.colores[0]) + '</span></p><div class="selector-colores">' + htmlColores + '</div>' : '') +
          (!agotado && p.stock <= 5 ? '<p style="font-size:12px; color:#a13a2f; margin-top:10px;">¡Solo quedan ' + p.stock + ' unidades!</p>' : '') +
          '<p class="selector-titulo">Cantidad</p>' +
          '<div class="selector-cantidad">' +
            '<button onclick="cambiarCantidad(-1)" ' + (agotado ? 'disabled' : '') + '>-</button>' +
            '<span id="cantidad-modal">' + (agotado ? 0 : 1) + '</span>' +
            '<button onclick="cambiarCantidad(1)" ' + (agotado ? 'disabled' : '') + '>+</button>' +
          '</div>' +
          '<div class="fila-botones">' +
            '<button class="btn btn-primario" onclick="agregarAlCarritoDesdeModal()" ' + (agotado ? 'disabled' : '') + '>' + (agotado ? 'Agotado' : 'Agregar al carrito') + '</button>' +
            '<button class="btn btn-dorado" onclick="comprarAhora()" ' + (agotado ? 'disabled' : '') + '>Comprar</button>' +
          '</div>' +
          '<div class="fila-secundaria">' +
            '<button onclick="alternarFavorito(\'' + p.id + '\'); actualizarBotonFavModal();" id="btn-fav-modal">' + iconoCorazon() + ' Favoritos</button>' +
            '<button onclick="compartirProducto()">&#8599; Compartir</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      productosRelacionadosHTML(p);

    document.getElementById('overlay-producto').classList.add('activo');
    document.getElementById('modal-producto').classList.add('activo');
  }

  function productosRelacionadosHTML(p) {
    var relacionados = ESTADO.productos.filter(function (x) { return x.categoria === p.categoria && x.id !== p.id; }).slice(0, 4);
    if (!relacionados.length) return '';
    return '<div style="padding:10px 40px 40px;">' +
      '<p class="selector-titulo" style="margin-bottom:16px;">También te puede gustar</p>' +
      '<div class="grid-productos" style="grid-template-columns:repeat(4,1fr);">' +
      relacionados.map(tarjetaProductoHTML).join('') + '</div></div>';
  }

  function colorACSS(nombre) {
    var mapa = {
      'dorado': '#c9a24b', 'oro': '#c9a24b', 'plateado': '#c0c0c0', 'plata': '#c0c0c0',
      'rosado': '#e8b4bc', 'rose gold': '#e8b4bc', 'negro': '#1c1c1c', 'blanco': '#f5f5f5',
      'rojo': '#8b1e1e', 'vino': '#4e1412', 'perla': '#f0e9df'
    };
    var clave = nombre.toLowerCase().trim();
    return mapa[clave] || clave;
  }

  function seleccionarColor(el, color) {
    ESTADO.colorSeleccionado = color;
    document.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('activo'); });
    el.classList.add('activo');
    var txt = document.getElementById('texto-color-elegido');
    if (txt) txt.textContent = color;
  }

  function cambiarImagenPrincipal(el, src) {
    document.getElementById('imagen-principal-modal').src = src;
    document.querySelectorAll('.galeria-miniaturas img').forEach(function (i) { i.classList.remove('activa'); });
    el.classList.add('activa');
  }

  /* Zoom tipo "lupa": en computador, acerca la imagen siguiendo el cursor. */
  function zoomImagen(e) {
    var img = document.getElementById('imagen-principal-modal');
    if (!img) return;
    var rect = e.currentTarget.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 100;
    var y = ((e.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = x + '% ' + y + '%';
    img.style.transform = 'scale(2.2)';
  }
  function resetZoom() {
    var img = document.getElementById('imagen-principal-modal');
    if (img) img.style.transform = 'scale(1)';
  }

  /* En celular (o si el cliente hace clic), abre la imagen a pantalla completa.
     Ahí se puede hacer zoom con el gesto de pellizco (pinch-to-zoom) normal del navegador. */
  function abrirLightbox() {
    var img = document.getElementById('imagen-principal-modal');
    if (!img || !img.src) return;
    document.getElementById('lightbox-img').src = img.src;
    document.getElementById('overlay-lightbox').classList.add('activo');
    document.getElementById('modal-lightbox').classList.add('activo');
  }
  function cerrarLightbox() {
    document.getElementById('overlay-lightbox').classList.remove('activo');
    document.getElementById('modal-lightbox').classList.remove('activo');
  }

  function cambiarCantidad(delta) {
    var stockMax = ESTADO.productoActual ? ESTADO.productoActual.stock : 99;
    var nueva = ESTADO.cantidadSeleccionada + delta;
    if (nueva > stockMax) {
      mostrarToast('Solo hay ' + stockMax + ' unidades disponibles');
      nueva = stockMax;
    }
    ESTADO.cantidadSeleccionada = Math.max(1, nueva);
    document.getElementById('cantidad-modal').textContent = ESTADO.cantidadSeleccionada;
  }

  function convertirVideoEmbebido(url) {
    if (url.indexOf('youtube.com') > -1 || url.indexOf('youtu.be') > -1) {
      var id = url.indexOf('youtu.be') > -1 ? url.split('/').pop() : (url.split('v=')[1] || '').split('&')[0];
      return 'https://www.youtube.com/embed/' + id;
    }
    if (url.indexOf('drive.google.com') > -1) {
      var match = url.match(/[-\w]{25,}/);
      return match ? 'https://drive.google.com/file/d/' + match[0] + '/preview' : url;
    }
    return url;
  }

  function cerrarProducto() {
    document.getElementById('overlay-producto').classList.remove('activo');
    document.getElementById('modal-producto').classList.remove('activo');
  }

  function actualizarBotonFavModal() {
    var p = ESTADO.productoActual;
    var btn = document.getElementById('btn-fav-modal');
    var esFav = ESTADO.favoritos.indexOf(p.id) > -1;
    if (btn) btn.innerHTML = iconoCorazon() + ' Favoritos' + (esFav ? ' (agregado)' : '');
  }

  function compartirProducto() {
    var p = ESTADO.productoActual;
    var texto = p.nombre + ' - ' + formatearPrecio(p.precio) + ' | Aluma';
    if (navigator.share) {
      navigator.share({ title: p.nombre, text: texto, url: location.href });
    } else {
      navigator.clipboard.writeText(texto + ' ' + location.href);
      mostrarToast('Enlace copiado');
    }
  }

  /* ---------------------------------------------------------
     FAVORITOS
     --------------------------------------------------------- */
  function alternarFavorito(id) {
    var i = ESTADO.favoritos.indexOf(id);
    if (i > -1) ESTADO.favoritos.splice(i, 1);
    else ESTADO.favoritos.push(id);
    localStorage.setItem('aluma_favoritos', JSON.stringify(ESTADO.favoritos));
    actualizarBadges();
    renderGrillas();
    filtrarPorCategoria(ESTADO.categoriaActiva);
    if (document.getElementById('panel-favoritos').classList.contains('activo')) renderFavoritos();
  }

  function abrirFavoritos() {
    renderFavoritos();
    document.getElementById('overlay-favoritos').classList.add('activo');
    document.getElementById('panel-favoritos').classList.add('activo');
  }
  function cerrarFavoritos() {
    document.getElementById('overlay-favoritos').classList.remove('activo');
    document.getElementById('panel-favoritos').classList.remove('activo');
  }
  function renderFavoritos() {
    var lista = ESTADO.productos.filter(function (p) { return ESTADO.favoritos.indexOf(p.id) > -1; });
    var cont = document.getElementById('contenido-favoritos');
    if (!lista.length) { cont.innerHTML = '<p class="carrito-vacio">Aún no tienes productos favoritos.</p>'; return; }
    cont.innerHTML = '<div class="grid-productos" style="grid-template-columns:1fr 1fr;">' + lista.map(tarjetaProductoHTML).join('') + '</div>';
  }

  /* ---------------------------------------------------------
     CARRITO
     --------------------------------------------------------- */
  function agregarAlCarritoDesdeModal() {
    var p = ESTADO.productoActual;
    agregarAlCarrito(p, ESTADO.colorSeleccionado, ESTADO.cantidadSeleccionada);
    mostrarToast('Producto agregado al carrito');
  }

  function comprarAhora() {
    agregarAlCarritoDesdeModal();
    cerrarProducto();
    abrirCarrito();
  }

  function agregarAlCarrito(p, color, cantidad) {
    var idLinea = p.id + '|' + color;
    var existente = ESTADO.carrito.filter(function (l) { return l.idLinea === idLinea; })[0];
    var cantidadActual = existente ? existente.cantidad : 0;
    var cantidadFinal = cantidadActual + cantidad;

    if (cantidadFinal > p.stock) {
      cantidadFinal = p.stock;
      mostrarToast('Ajustamos la cantidad: solo hay ' + p.stock + ' unidades de "' + p.nombre + '"');
    }
    if (cantidadFinal <= 0) return;

    if (existente) {
      existente.cantidad = cantidadFinal;
    } else {
      ESTADO.carrito.push({
        idLinea: idLinea, id: p.id, nombre: p.nombre, precio: p.precio,
        color: color, imagen: urlImagen(p.imagen), cantidad: cantidadFinal
      });
    }
    guardarCarrito();
  }

  function guardarCarrito() {
    localStorage.setItem('aluma_carrito', JSON.stringify(ESTADO.carrito));
    actualizarBadges();
    if (document.getElementById('panel-carrito').classList.contains('activo')) renderCarrito();
  }

  function cambiarCantidadCarrito(idLinea, delta) {
    var linea = ESTADO.carrito.filter(function (l) { return l.idLinea === idLinea; })[0];
    if (!linea) return;

    if (delta > 0) {
      var producto = ESTADO.productos.filter(function (p) { return p.id === linea.id; })[0];
      var stockMax = producto ? producto.stock : 99;
      if (linea.cantidad + delta > stockMax) {
        mostrarToast('Solo hay ' + stockMax + ' unidades disponibles');
        return;
      }
    }

    linea.cantidad += delta;
    if (linea.cantidad <= 0) {
      ESTADO.carrito = ESTADO.carrito.filter(function (l) { return l.idLinea !== idLinea; });
    }
    guardarCarrito();
  }

  function quitarDelCarrito(idLinea) {
    ESTADO.carrito = ESTADO.carrito.filter(function (l) { return l.idLinea !== idLinea; });
    guardarCarrito();
  }

  function vaciarCarrito() {
    ESTADO.carrito = [];
    guardarCarrito();
  }

  function totalCarrito() {
    return ESTADO.carrito.reduce(function (t, l) { return t + l.precio * l.cantidad; }, 0);
  }

  function abrirCarrito() {
    renderCarrito();
    document.getElementById('overlay-carrito').classList.add('activo');
    document.getElementById('panel-carrito').classList.add('activo');
  }
  function cerrarCarrito() {
    document.getElementById('overlay-carrito').classList.remove('activo');
    document.getElementById('panel-carrito').classList.remove('activo');
  }

  function renderCarrito() {
    var cont = document.getElementById('contenido-carrito');
    var pie = document.getElementById('pie-carrito');

    if (!ESTADO.carrito.length) {
      cont.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío por ahora.<br>Explora la tienda y encuentra tu próxima pieza favorita.</p>';
      pie.innerHTML = '';
      return;
    }

    cont.innerHTML = ESTADO.carrito.map(function (l) {
      return (
        '<div class="fila-carrito">' +
          '<img src="' + l.imagen + '">' +
          '<div class="detalle">' +
            '<h4>' + escapeHTML(l.nombre) + '</h4>' +
            (l.color ? '<p class="variante">Color: ' + escapeHTML(l.color) + '</p>' : '') +
            '<p class="variante">' + formatearPrecio(l.precio) + '</p>' +
            '<div class="fila-cantidad">' +
              '<button onclick="cambiarCantidadCarrito(\'' + l.idLinea + '\', -1)">-</button>' +
              '<span>' + l.cantidad + '</span>' +
              '<button onclick="cambiarCantidadCarrito(\'' + l.idLinea + '\', 1)">+</button>' +
              '<button class="quitar-item" onclick="quitarDelCarrito(\'' + l.idLinea + '\')" style="margin-left:auto;">Quitar</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    pie.innerHTML =
      '<div class="resumen-linea total"><span>Total</span><span>' + formatearPrecio(totalCarrito()) + '</span></div>' +
      '<button class="btn btn-primario btn-full" style="margin-top:14px;" onclick="cerrarCarrito(); abrirCheckout();">Finalizar pedido</button>' +
      '<button class="btn btn-texto btn-full" style="margin-top:10px;" onclick="vaciarCarrito()">Vaciar carrito</button>';
  }

  function actualizarBadges() {
    var totalItems = ESTADO.carrito.reduce(function (t, l) { return t + l.cantidad; }, 0);
    var badgeCarrito = document.getElementById('badge-carrito');
    badgeCarrito.textContent = totalItems;
    badgeCarrito.classList.toggle('oculto', totalItems === 0);

    var badgeFav = document.getElementById('badge-favoritos');
    badgeFav.textContent = ESTADO.favoritos.length;
    badgeFav.classList.toggle('oculto', ESTADO.favoritos.length === 0);
  }

  /* ---------------------------------------------------------
     CHECKOUT — Datos > Entrega > Pago > Resumen > WhatsApp
     --------------------------------------------------------- */
  function abrirCheckout() {
    if (!ESTADO.carrito.length) { mostrarToast('Tu carrito está vacío'); return; }
    irAPaso(1);
    document.getElementById('overlay-checkout').classList.add('activo');
    document.getElementById('modal-checkout').classList.add('activo');
  }
  function cerrarCheckout() {
    document.getElementById('overlay-checkout').classList.remove('activo');
    document.getElementById('modal-checkout').classList.remove('activo');
  }

  function irAPaso(n) {
    document.querySelectorAll('.paso-form').forEach(function (p) { p.classList.remove('activo'); });
    document.getElementById('paso-' + n).classList.add('activo');
    document.querySelectorAll('.paso-item').forEach(function (p) {
      var num = Number(p.getAttribute('data-paso'));
      p.classList.toggle('activo', num === n);
      p.classList.toggle('completo', num < n);
    });
  }

  function marcarError(idCampo, hayError) {
    document.getElementById(idCampo).classList.toggle('con-error', hayError);
  }

  function validarPaso1() {
    var nombre = document.getElementById('input-nombre').value.trim();
    var telefono = document.getElementById('input-telefono').value.trim();
    var ciudad = document.getElementById('input-ciudad').value.trim();
    var barrio = document.getElementById('input-barrio').value.trim();
    var direccion = document.getElementById('input-direccion').value.trim();

    var ok = true;
    marcarError('campo-nombre', nombre.length < 3); if (nombre.length < 3) ok = false;
    marcarError('campo-telefono', telefono.replace(/[^0-9]/g, '').length < 7); if (telefono.replace(/[^0-9]/g, '').length < 7) ok = false;
    marcarError('campo-ciudad', ciudad.length < 2); if (ciudad.length < 2) ok = false;
    marcarError('campo-barrio', barrio.length < 2); if (barrio.length < 2) ok = false;
    marcarError('campo-direccion', direccion.length < 5); if (direccion.length < 5) ok = false;

    if (!ok) return;

    var ciudadesContraEntrega = (ESTADO.config.CiudadesContraEntrega || 'Barranquilla,Soledad')
      .split(',').map(function (c) { return c.trim().toLowerCase(); });

    var opcionContraEntrega = document.getElementById('opcion-contraentrega');
    var permitida = ciudadesContraEntrega.indexOf(ciudad.toLowerCase()) > -1;
    opcionContraEntrega.classList.toggle('deshabilitada', !permitida);
    if (!permitida && ESTADO.entregaSeleccionada === 'Contra entrega') ESTADO.entregaSeleccionada = '';

    irAPaso(2);
  }

  function seleccionarEntrega(valor) {
    var opcionContraEntrega = document.getElementById('opcion-contraentrega');
    if (valor === 'Contra entrega' && opcionContraEntrega.classList.contains('deshabilitada')) return;
    ESTADO.entregaSeleccionada = valor;
    document.querySelectorAll('#paso-2 .opcion-metodo').forEach(function (el) { el.classList.remove('seleccionada'); });
    document.querySelectorAll('#paso-2 input[type=radio]').forEach(function (r) { r.checked = (r.value === valor); });
    event.currentTarget.classList.add('seleccionada');
  }

  function validarPaso2() {
    if (!ESTADO.entregaSeleccionada) { mostrarToast('Selecciona un método de entrega'); return; }

    var opcionEfectivo = document.getElementById('opcion-efectivo');
    var soloContraEntrega = ESTADO.entregaSeleccionada === 'Contra entrega';
    opcionEfectivo.classList.toggle('deshabilitada', !soloContraEntrega);
    if (!soloContraEntrega && ESTADO.pagoSeleccionado === 'Efectivo contra entrega') ESTADO.pagoSeleccionado = '';

    irAPaso(3);
  }

  function seleccionarPago(valor, el) {
    if (valor === 'Efectivo contra entrega' && document.getElementById('opcion-efectivo').classList.contains('deshabilitada')) return;
    ESTADO.pagoSeleccionado = valor;
    document.querySelectorAll('#paso-3 .opcion-metodo').forEach(function (o) { o.classList.remove('seleccionada'); });
    document.querySelectorAll('#paso-3 input[type=radio]').forEach(function (r) { r.checked = (r.value === valor); });
    el.classList.add('seleccionada');
  }

  function validarPaso3() {
    if (!ESTADO.pagoSeleccionado) { mostrarToast('Selecciona un método de pago'); return; }
    renderResumenCheckout();
    irAPaso(4);
  }

  function renderResumenCheckout() {
    var cont = document.getElementById('resumen-productos');
    cont.innerHTML = ESTADO.carrito.map(function (l) {
      return '<div class="resumen-linea"><span>' + escapeHTML(l.nombre) + (l.color ? ' (' + escapeHTML(l.color) + ')' : '') + ' x' + l.cantidad + '</span><span>' + formatearPrecio(l.precio * l.cantidad) + '</span></div>';
    }).join('');
    document.getElementById('resumen-entrega').textContent = ESTADO.entregaSeleccionada;
    document.getElementById('resumen-pago').textContent = ESTADO.pagoSeleccionado;
    document.getElementById('resumen-total').textContent = formatearPrecio(totalCarrito());
  }

  function enviarPedidoWhatsApp() {
    var datosCliente = {
      nombre: document.getElementById('input-nombre').value.trim(),
      telefono: document.getElementById('input-telefono').value.trim(),
      ciudad: document.getElementById('input-ciudad').value.trim(),
      barrio: document.getElementById('input-barrio').value.trim(),
      direccion: document.getElementById('input-direccion').value.trim(),
      metodoEntrega: ESTADO.entregaSeleccionada,
      metodoPago: ESTADO.pagoSeleccionado,
      productos: ESTADO.carrito,
      total: totalCarrito()
    };

    var mensaje = construirMensajeWhatsApp(datosCliente);
    var numero = obtenerNumeroWhatsApp();
    var url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensaje);

    // Guardamos el pedido en la hoja de Pedidos como registro interno.
    llamarApiEscritura('guardarPedido', datosCliente);

    window.open(url, '_blank');

    vaciarCarrito();
    cerrarCheckout();
    reiniciarFormularioCheckout();
  }

  function construirMensajeWhatsApp(d) {
    var lineas = [];
    lineas.push('Hola, soy ' + d.nombre + '. Quiero hacer un pedido en Aluma.');
    lineas.push('');
    lineas.push('Mis datos:');
    lineas.push('Teléfono: ' + d.telefono);
    lineas.push('Ciudad: ' + d.ciudad);
    lineas.push('Barrio: ' + d.barrio);
    lineas.push('Dirección: ' + d.direccion);
    lineas.push('');
    lineas.push('Pedido:');
    d.productos.forEach(function (l) {
      var variante = l.color ? ' (' + l.color + ')' : '';
      lineas.push('- ' + l.nombre + variante + ' x' + l.cantidad + ' - ' + formatearPrecio(l.precio * l.cantidad));
    });
    lineas.push('');
    lineas.push('Total productos: ' + formatearPrecio(d.total));
    lineas.push('');
    lineas.push('Método de entrega: ' + d.metodoEntrega);
    lineas.push('Método de pago: ' + d.metodoPago);
    lineas.push('');
    lineas.push('Quedo atento(a) a la cotización del envío para confirmar la compra. Gracias.');
    return lineas.join('\n');
  }

  function reiniciarFormularioCheckout() {
    ['input-nombre', 'input-telefono', 'input-ciudad', 'input-barrio', 'input-direccion'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    ESTADO.entregaSeleccionada = '';
    ESTADO.pagoSeleccionado = '';
    document.querySelectorAll('.opcion-metodo').forEach(function (el) { el.classList.remove('seleccionada'); });
    irAPaso(1);
  }

  /* ---------------------------------------------------------
     RESEÑAS / INSTAGRAM
     --------------------------------------------------------- */
  function renderResenas() {
    var cont = document.getElementById('grid-resenas');
    if (!ESTADO.opiniones.length) { cont.innerHTML = ''; return; }
    cont.innerHTML = ESTADO.opiniones.map(function (o) {
      var estrellas = '&#9733;'.repeat(Math.round(o.calificacion)) + '&#9734;'.repeat(5 - Math.round(o.calificacion));
      return '<div class="tarjeta-resena fade-in visible"><div class="estrellas">' + estrellas + '</div><p>"' + escapeHTML(o.texto) + '"</p><h5>' + escapeHTML(o.nombre) + '</h5></div>';
    }).join('');
  }

  ESTADO.calificacionSeleccionada = 5;

  function renderSelectorEstrellas() {
    var cont = document.getElementById('selector-estrellas');
    if (!cont) return;
    cont.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      var span = document.createElement('span');
      span.textContent = i <= ESTADO.calificacionSeleccionada ? '\u2605' : '\u2606';
      span.style.marginRight = '4px';
      span.onclick = (function (valor) {
        return function () { ESTADO.calificacionSeleccionada = valor; renderSelectorEstrellas(); };
      })(i);
      cont.appendChild(span);
    }
  }

  function enviarResena() {
    var nombre = document.getElementById('resena-nombre').value.trim();
    var texto = document.getElementById('resena-texto').value.trim();

    if (nombre.length < 2) { mostrarToast('Escribe tu nombre'); return; }
    if (texto.length < 5) { mostrarToast('Cuéntanos un poco más en tu opinión'); return; }

    llamarApiEscritura('enviarOpinion', { nombre: nombre, texto: texto, calificacion: ESTADO.calificacionSeleccionada }, function () {
      mostrarToast('¡Gracias! Tu opinión quedó pendiente de aprobación');
      document.getElementById('resena-nombre').value = '';
      document.getElementById('resena-texto').value = '';
      ESTADO.calificacionSeleccionada = 5;
      renderSelectorEstrellas();
    }, function () {
      mostrarToast('No se pudo enviar tu opinión, intenta de nuevo');
    });
  }

  function nombreUsuarioDesdeURL(url) {
    if (!url) return '';
    var limpio = String(url).split('?')[0].split('#')[0].replace(/\/+$/, '');
    var partes = limpio.split('/').filter(Boolean);
    return partes.pop() || '';
  }

  function renderInstagram() {
    var cont = document.getElementById('grid-instagram');
    var imagenes = ESTADO.productos.slice(0, 6).map(function (p) { return urlImagen(p.imagen); });
    if (ESTADO.config.InstagramURL) document.getElementById('titulo-instagram').textContent = '@' + nombreUsuarioDesdeURL(ESTADO.config.InstagramURL);
    cont.innerHTML = imagenes.map(function (img) {
      return '<a href="' + (ESTADO.config.InstagramURL || '#') + '" target="_blank"><img src="' + img + '" loading="lazy"></a>';
    }).join('');
  }

  /* ---------------------------------------------------------
     NEWSLETTER / POLÍTICAS
     --------------------------------------------------------- */
  function enviarNewsletter(evento) {
    evento.preventDefault();
    var email = document.getElementById('input-newsletter').value.trim();
    llamarApiEscritura('guardarNewsletter', { email: email });
    document.getElementById('input-newsletter').value = '';
    mostrarToast('Gracias por suscribirte');
    return false;
  }

  var TEXTOS_POLITICA = {
    cambios: ['Política de cambios', 'En ALUMA queremos garantizar la mejor experiencia con tus accesorios. Los cambios aplican únicamente por detalles de fabricación reportados dentro de los primeros 5 días. No realizamos cambios por daños ocasionados por uso inadecuado, golpes, caídas, piezas partidas, pérdida de piedras, manipulación del producto o desgaste natural del accesorio. Recomendamos seguir nuestras indicaciones de cuidado para conservar tus piezas en perfecto estado.'],
    privacidad: ['Política de privacidad', 'Tus datos personales se usan únicamente para procesar tu pedido y contactarte. No compartimos tu información con terceros.'],
    terminos: ['Términos y condiciones', 'Al realizar una compra en Aluma aceptas nuestras condiciones de venta, tiempos de entrega estimados y política de cambios.'],
    faq: ['Preguntas frecuentes', '¿Cómo pago? Por transferencia o efectivo contra entrega en las ciudades disponibles.<br><br>¿Hacen envíos nacionales? Sí, a toda Colombia.<br><br>¿Cuánto tarda mi pedido? Te lo confirmamos por WhatsApp según tu ciudad.']
  };
  function abrirPolitica(clave) {
    var datos = TEXTOS_POLITICA[clave];
    document.getElementById('titulo-politica').textContent = datos[0];
    document.getElementById('texto-politica').innerHTML = datos[1];
    document.getElementById('overlay-politica').classList.add('activo');
    document.getElementById('modal-politica').classList.add('activo');
  }
  function cerrarPolitica() {
    document.getElementById('overlay-politica').classList.remove('activo');
    document.getElementById('modal-politica').classList.remove('activo');
  }

  /* ---------------------------------------------------------
     MENÚ MÓVIL / MODO OSCURO / SCROLL
     --------------------------------------------------------- */
  function abrirMenuMovil() {
    document.getElementById('menu-movil').classList.add('activo');
    document.getElementById('overlay-menu-movil').classList.add('activo');
  }
  function cerrarMenuMovil() {
    document.getElementById('menu-movil').classList.remove('activo');
    document.getElementById('overlay-menu-movil').classList.remove('activo');
  }

  function alternarModoOscuro() {
    document.body.classList.toggle('modo-oscuro');
  }

  function manejarScroll() {
    var btn = document.getElementById('btn-subir');
    btn.classList.toggle('visible', window.scrollY > 500);
  }
  function irArriba() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function observarAnimaciones() {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) e.target.classList.add('visible');
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.fade-in').forEach(function (el) { observador.observe(el); });
  }

  /* ---------------------------------------------------------
     UTILIDADES
     --------------------------------------------------------- */
  function mostrarToast(texto) {
    var t = document.getElementById('toast');
    t.textContent = texto;
    t.classList.add('visible');
    setTimeout(function () { t.classList.remove('visible'); }, 2200);
  }

  function iconoCorazon() {
    return '<svg class="icono-corazon" viewBox="0 0 24 24" width="16" height="16"><path d="M12 21s-6.7-4.3-9.3-8.1C.7 9.7 1.6 6 4.6 4.8 7 3.8 9.6 4.8 12 7.5c2.4-2.7 5-3.7 7.4-2.7 3 1.2 3.9 4.9 1.9 8.1C18.7 16.7 12 21 12 21z"></path></svg>';
  }

  function escapeHTML(texto) {
    if (texto === undefined || texto === null) return '';
    return String(texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
