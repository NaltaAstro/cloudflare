addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Configurações
  const TARGET_HOSTNAME = "controle-bc.bubbleapps.io"
  const YOUR_HOSTNAME = "worbyta.com"
  
  // Obter a URL da solicitação
  const url = new URL(request.url)
  
  // Criar uma URL para o Bubble.io
  const bubbleUrl = new URL(url.pathname + url.search, `https://${TARGET_HOSTNAME}`)
  
  // Clonar os cabeçalhos
  const newHeaders = new Headers(request.headers)
  newHeaders.set('Host', TARGET_HOSTNAME)
  newHeaders.set('Origin', `https://${TARGET_HOSTNAME}`)
  newHeaders.set('Referer', `https://${TARGET_HOSTNAME}${url.pathname}`)
  
  // Remover cabeçalhos problemáticos
  newHeaders.delete('CF-Connecting-IP')
  newHeaders.delete('CF-IPCountry')
  newHeaders.delete('CF-RAY')
  newHeaders.delete('CF-Visitor')
  newHeaders.delete('CF-Worker')
  
  // Criar a nova solicitação
  const newRequest = new Request(bubbleUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual'
  })
  
  // Fazer a solicitação para o Bubble.io
  let response
  try {
    response = await fetch(newRequest, {
      cf: {
        // Usar um IP diferente para cada solicitação para evitar limitação de taxa
        cacheEverything: false,
        cacheTtl: 0,
        scrapeShield: false,
        mirage: false,
        apps: false
      }
    })
    
    // Lidar com redirecionamentos manualmente
    if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      const location = response.headers.get('Location')
      if (location) {
        const newLocation = location.replace(TARGET_HOSTNAME, YOUR_HOSTNAME)
        const redirectHeaders = new Headers(response.headers)
        redirectHeaders.set('Location', newLocation)
        return new Response(null, {
          status: response.status,
          headers: redirectHeaders
        })
      }
    }
  } catch (e) {
    return new Response('Erro ao acessar o servidor: ' + e.message, { status: 500 })
  }
  
  // Clonar a resposta para modificá-la
  const responseHeaders = new Headers(response.headers)
  
  // Adicionar cabeçalhos CORS
  responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*')
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With')
  responseHeaders.set('Access-Control-Allow-Credentials', 'true')
  
  // Processar cookies
  if (responseHeaders.has('Set-Cookie')) {
    const cookies = responseHeaders.getAll('Set-Cookie')
    responseHeaders.delete('Set-Cookie')
    
    for (const cookie of cookies) {
      let newCookie = cookie
        .replace(`Domain=${TARGET_HOSTNAME}`, `Domain=${YOUR_HOSTNAME}`)
        .replace(/Domain=\.bubbleapps\.io/gi, `Domain=${YOUR_HOSTNAME}`)
      
      if (!newCookie.includes('Domain=')) {
        newCookie += `; Domain=${YOUR_HOSTNAME}`
      }
      
      responseHeaders.append('Set-Cookie', newCookie)
    }
  }
  
  // Verificar o tipo de conteúdo
  const contentType = responseHeaders.get('content-type') || ''
  
  // Se for texto, HTML, JavaScript ou JSON, modificar o conteúdo
  if (contentType.includes('text/') || 
      contentType.includes('application/json') || 
      contentType.includes('application/javascript')) {
    try {
      let text = await response.text()
      
      // Adicionar scripts de interceptação para XMLHttpRequest e fetch
      if (contentType.includes('text/html')) {
        const interceptScript = `
<script>
  // Interceptar XMLHttpRequest
  var originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    if (arguments[1] && typeof arguments[1] === 'string') {
      arguments[1] = arguments[1].replace(/https?:\\/\\/${TARGET_HOSTNAME}/g, 'https://${YOUR_HOSTNAME}');
    }
    return originalXhrOpen.apply(this, arguments);
  };
  
  // Interceptar fetch
  var originalFetch = window.fetch;
  window.fetch = function(url, options) {
    if (url && typeof url === 'string') {
      url = url.replace(/https?:\\/\\/${TARGET_HOSTNAME}/g, 'https://${YOUR_HOSTNAME}');
    }
    return originalFetch.call(this, url, options);
  };
  
  // Interceptar pushState e replaceState
  var originalPushState = history.pushState;
  history.pushState = function() {
    if (arguments[2] && typeof arguments[2] === 'string') {
      arguments[2] = arguments[2].replace(/https?:\\/\\/${TARGET_HOSTNAME}/g, 'https://${YOUR_HOSTNAME}');
    }
    return originalPushState.apply(this, arguments);
  };
  
  var originalReplaceState = history.replaceState;
  history.replaceState = function() {
    if (arguments[2] && typeof arguments[2] === 'string') {
      arguments[2] = arguments[2].replace(/https?:\\/\\/${TARGET_HOSTNAME}/g, 'https://${YOUR_HOSTNAME}');
    }
    return originalReplaceState.apply(this, arguments);
  };
  
  // Corrigir window.location.origin
  Object.defineProperty(window.location, 'origin', {
    get: function() {
      return 'https://${YOUR_HOSTNAME}';
    }
  });
  
  // Corrigir document.domain
  Object.defineProperty(document, 'domain', {
    get: function() {
      return '${YOUR_HOSTNAME}';
    },
    set: function() {
      // Ignorar tentativas de definir document.domain
    }
  });
</script>`;
        
        // Inserir o script após a tag <head>
        text = text.replace('</head>', interceptScript + '</head>');
      }
      
      // Substituir todas as referências ao domínio do Bubble
      text = text.replace(new RegExp(`https://${TARGET_HOSTNAME}`, 'g'), `https://${YOUR_HOSTNAME}`);
      text = text.replace(new RegExp(`http://${TARGET_HOSTNAME}`, 'g'), `https://${YOUR_HOSTNAME}`);
      text = text.replace(new RegExp(`//${TARGET_HOSTNAME}`, 'g'), `//${YOUR_HOSTNAME}`);
      text = text.replace(new RegExp(`"${TARGET_HOSTNAME}"`, 'g'), `"${YOUR_HOSTNAME}"`);
      text = text.replace(new RegExp(`'${TARGET_HOSTNAME}'`, 'g'), `'${YOUR_HOSTNAME}'`);
      
      // Substituir referências em JSON
      if (contentType.includes('application/json')) {
        try {
          const jsonData = JSON.parse(text);
          text = JSON.stringify(jsonData).replace(new RegExp(TARGET_HOSTNAME, 'g'), YOUR_HOSTNAME);
        } catch (e) {
          // Se não conseguir analisar o JSON, continuar com o texto modificado
        }
      }
      
      // Criar uma nova resposta com o texto modificado
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (e) {
      return new Response('Erro ao processar a resposta: ' + e.message, { status: 500 });
    }
  }
  
  // Para outros tipos de conteúdo, apenas passar adiante
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}
