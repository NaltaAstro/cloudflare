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
  
  // Verificar se é uma solicitação OPTIONS (CORS preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, X-Requested-With, X-Bubble-*",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400"
      }
    })
  }
  
  // Clonar os cabeçalhos e preservar todos os headers X-Bubble-*
  const newHeaders = new Headers()
  for (const [key, value] of request.headers.entries()) {
    // Preservar todos os headers originais exceto host e origin
    if (key.toLowerCase() !== 'host' && key.toLowerCase() !== 'origin') {
      newHeaders.set(key, value)
    }
  }
  
  // Definir os headers específicos para o Bubble
  newHeaders.set('Host', TARGET_HOSTNAME)
  newHeaders.set('Origin', `https://${TARGET_HOSTNAME}`)
  newHeaders.set('Referer', `https://${TARGET_HOSTNAME}${url.pathname}`)
  
  // Preservar cookies
  const cookieHeader = request.headers.get('Cookie')
  if (cookieHeader) {
    newHeaders.set('Cookie', cookieHeader)
  }
  
  // Obter o corpo da solicitação
  let requestBody = null
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      // Tentar obter o corpo como texto
      const bodyText = await request.text()
      
      // Se for JSON, modificar as referências ao domínio
      if (request.headers.get('Content-Type')?.includes('application/json')) {
        try {
          const bodyJson = JSON.parse(bodyText)
          const modifiedBodyText = JSON.stringify(bodyJson).replace(new RegExp(YOUR_HOSTNAME, 'g'), TARGET_HOSTNAME)
          requestBody = modifiedBodyText
        } catch (e) {
          // Se não for JSON válido, usar o texto original
          requestBody = bodyText
        }
      } else {
        requestBody = bodyText
      }
    } catch (e) {
      // Se não conseguir obter o corpo, continuar sem ele
      console.error('Erro ao obter o corpo da solicitação:', e)
    }
  }
  
  // Criar a nova solicitação
  const newRequest = new Request(bubbleUrl, {
    method: request.method,
    headers: newHeaders,
    body: requestBody,
    redirect: 'manual'
  })
  
  // Fazer a solicitação para o Bubble.io
  let response
  try {
    response = await fetch(newRequest, {
      cf: {
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
    
    // Tratamento especial para erros 401 em solicitações de logout
    if (response.status === 401 && url.pathname.includes('/workflow/start')) {
      // Verificar se é uma solicitação de logout pelo corpo
      if (requestBody && requestBody.includes('logout')) {
        // Simular uma resposta de sucesso para o logout
        return new Response(JSON.stringify({
          status: "success",
          message: "Logout successful"
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, X-Requested-With",
            "Access-Control-Allow-Credentials": "true"
          }
        })
      }
    }
  } catch (e) {
    return new Response('Erro ao acessar o servidor: ' + e.message, { status: 500 })
  }
  
  // Clonar a resposta para modificá-la
  const responseHeaders = new Headers()
  
  // Copiar todos os headers da resposta
  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() !== 'set-cookie') {
      responseHeaders.set(key, value)
    }
  }
  
  // Adicionar cabeçalhos CORS
  responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*')
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With, X-Bubble-*')
  responseHeaders.set('Access-Control-Allow-Credentials', 'true')
  
  // Processar cookies
  if (response.headers.has('Set-Cookie')) {
    const cookies = response.headers.getAll('Set-Cookie')
    
    for (const cookie of cookies) {
      let newCookie = cookie
        .replace(`Domain=${TARGET_HOSTNAME}`, `Domain=${YOUR_HOSTNAME}`)
        .replace(/Domain=\.bubbleapps\.io/gi, `Domain=${YOUR_HOSTNAME}`)
        .replace(/SameSite=None/gi, 'SameSite=Lax') // Ajustar SameSite para melhor compatibilidade
      
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
  
  // Interceptar o evento de logout para garantir que funcione corretamente
  document.addEventListener('click', function(e) {
    if (e.target && (
        e.target.id === 'logout-button' || 
        e.target.classList.contains('logout-button') ||
        (e.target.textContent && e.target.textContent.toLowerCase().includes('logout')) ||
        (e.target.innerText && e.target.innerText.toLowerCase().includes('logout'))
    )) {
      // Adicionar um pequeno atraso para garantir que o logout seja processado corretamente
      setTimeout(function() {
        // Limpar cookies manualmente
        document.cookie.split(';').forEach(function(c) {
          document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=${YOUR_HOSTNAME}';
        });
      }, 100);
    }
  }, true);
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
