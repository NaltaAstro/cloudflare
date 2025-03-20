addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Configurações
  const MAIN_DOMAIN = "tenhopedido.com"
  const SUBDOMAIN = "burgers-culture.tenhopedido.com"
  
  // Obter a URL da solicitação
  const url = new URL(request.url)
  
  // Verificar se a solicitação é para o subdomínio
  if (url.hostname === SUBDOMAIN) {
    // Criar a URL de destino no domínio principal
    const targetUrl = new URL(url.pathname + url.search, `https://${MAIN_DOMAIN}`)
    
    // Verificar se é uma solicitação OPTIONS (CORS preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, X-Requested-With, X-Bubble-*",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400"
        }
      })
    }
    
    // Clonar os cabeçalhos
    const newHeaders = new Headers()
    
    // Copiar todos os cabeçalhos originais, exceto host, origin e cookie (que trataremos separadamente)
    for (const [key, value] of request.headers.entries()) {
      if (key.toLowerCase() !== 'host' && 
          key.toLowerCase() !== 'origin' && 
          key.toLowerCase() !== 'referer' && 
          key.toLowerCase() !== 'cookie') {
        newHeaders.set(key, value)
      }
    }
    
    // Definir os cabeçalhos específicos para o domínio principal
    newHeaders.set('Host', MAIN_DOMAIN)
    newHeaders.set('Origin', `https://${MAIN_DOMAIN}`)
    newHeaders.set('Referer', `https://${MAIN_DOMAIN}${url.pathname}`)
    
    // Processar cookies da solicitação - PARTE CRÍTICA
    const cookieHeader = request.headers.get('Cookie')
    if (cookieHeader) {
      // Dividir os cookies individuais
      const cookies = cookieHeader.split(';').map(cookie => cookie.trim())
      
      // Criar um novo array de cookies modificados
      const modifiedCookies = cookies.map(cookie => {
        // Não modificamos o valor do cookie, apenas garantimos que seja enviado corretamente
        return cookie
      })
      
      // Definir o cabeçalho Cookie modificado
      newHeaders.set('Cookie', modifiedCookies.join('; '))
    }
    
    // Obter o corpo da solicitação
    let requestBody = null
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        // Obter o corpo como texto
        const bodyText = await request.text()
        
        // Se for JSON, modificar as referências ao domínio
        if (request.headers.get('Content-Type')?.includes('application/json')) {
          try {
            const bodyJson = JSON.parse(bodyText)
            // Substituir todas as ocorrências do subdomínio pelo domínio principal no JSON
            const modifiedBodyText = JSON.stringify(bodyJson).replace(new RegExp(SUBDOMAIN, 'g'), MAIN_DOMAIN)
            requestBody = modifiedBodyText
          } catch (e) {
            // Se não for JSON válido, usar o texto original
            requestBody = bodyText
          }
        } else {
          requestBody = bodyText
        }
      } catch (e) {
        console.error('Erro ao obter o corpo da solicitação:', e)
      }
    }
    
    // Criar a nova solicitação
    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: requestBody,
      redirect: 'manual'
    })
    
    // Fazer a solicitação para o domínio principal
    try {
      const response = await fetch(newRequest)
      
      // Lidar com redirecionamentos manualmente
      if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
        const location = response.headers.get('Location')
        if (location) {
          const newLocation = location.replace(MAIN_DOMAIN, SUBDOMAIN)
          const redirectHeaders = new Headers(response.headers)
          redirectHeaders.set('Location', newLocation)
          return new Response(null, {
            status: response.status,
            headers: redirectHeaders
          })
        }
      }
      
      // Clonar a resposta para modificá-la
      const responseHeaders = new Headers()
      
      // Copiar todos os cabeçalhos da resposta, exceto set-cookie
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
      
      // Processar cookies da resposta - PARTE CRÍTICA
      if (response.headers.has('Set-Cookie')) {
        const cookies = response.headers.getAll('Set-Cookie')
        
        for (const cookie of cookies) {
          // Analisar o cookie para extrair suas partes
          const cookieParts = cookie.split(';').map(part => part.trim())
          const cookieNameValue = cookieParts[0]
          const remainingParts = cookieParts.slice(1)
          
          // Filtrar partes que contêm Domain= e Path=
          const domainParts = remainingParts.filter(part => part.toLowerCase().startsWith('domain='))
          const pathParts = remainingParts.filter(part => part.toLowerCase().startsWith('path='))
          const otherParts = remainingParts.filter(part => 
            !part.toLowerCase().startsWith('domain=') && 
            !part.toLowerCase().startsWith('path=')
          )
          
          // Construir o novo cookie com o domínio correto
          let newCookieParts = [cookieNameValue]
          
          // Adicionar Domain= para o subdomínio
          newCookieParts.push(`Domain=.tenhopedido.com`)
          
          // Adicionar Path= se existir, ou definir como /
          if (pathParts.length > 0) {
            newCookieParts.push(pathParts[0])
          } else {
            newCookieParts.push('Path=/')
          }
          
          // Adicionar outras partes, exceto SameSite=None que pode causar problemas
          for (const part of otherParts) {
            if (!part.toLowerCase().startsWith('samesite=none')) {
              newCookieParts.push(part)
            }
          }
          
          // Adicionar SameSite=Lax para melhor compatibilidade
          if (!otherParts.some(part => part.toLowerCase().startsWith('samesite='))) {
            newCookieParts.push('SameSite=Lax')
          }
          
          // Juntar todas as partes em um único cookie
          const newCookie = newCookieParts.join('; ')
          
          // Adicionar o cookie modificado aos cabeçalhos de resposta
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
      arguments[1] = arguments[1].replace(/https?:\\/\\/${MAIN_DOMAIN}/g, 'https://${SUBDOMAIN}');
    }
    return originalXhrOpen.apply(this, arguments);
  };
  
  // Interceptar fetch
  var originalFetch = window.fetch;
  window.fetch = function(url, options) {
    if (url && typeof url === 'string') {
      url = url.replace(/https?:\\/\\/${MAIN_DOMAIN}/g, 'https://${SUBDOMAIN}');
    }
    return originalFetch.call(this, url, options);
  };
  
  // Interceptar pushState e replaceState
  var originalPushState = history.pushState;
  history.pushState = function() {
    if (arguments[2] && typeof arguments[2] === 'string') {
      arguments[2] = arguments[2].replace(/https?:\\/\\/${MAIN_DOMAIN}/g, 'https://${SUBDOMAIN}');
    }
    return originalPushState.apply(this, arguments);
  };
  
  var originalReplaceState = history.replaceState;
  history.replaceState = function() {
    if (arguments[2] && typeof arguments[2] === 'string') {
      arguments[2] = arguments[2].replace(/https?:\\/\\/${MAIN_DOMAIN}/g, 'https://${SUBDOMAIN}');
    }
    return originalReplaceState.apply(this, arguments);
  };
  
  // Corrigir window.location.origin
  Object.defineProperty(window.location, 'origin', {
    get: function() {
      return 'https://${SUBDOMAIN}';
    }
  });
  
  // Corrigir document.domain
  Object.defineProperty(document, 'domain', {
    get: function() {
      return 'tenhopedido.com';
    },
    set: function() {
      // Ignorar tentativas de definir document.domain
    }
  });
  
  // Sincronizar cookies entre domínios
  function syncCookies() {
    try {
      // Obter todos os cookies
      var allCookies = document.cookie.split(';');
      
      // Para cada cookie, garantir que ele esteja disponível para o domínio raiz
      for (var i = 0; i < allCookies.length; i++) {
        var cookie = allCookies[i].trim();
        if (cookie) {
          var cookieParts = cookie.split('=');
          var cookieName = cookieParts[0];
          var cookieValue = cookieParts.slice(1).join('=');
          
          // Definir o cookie para o domínio raiz
          document.cookie = cookieName + '=' + cookieValue + '; path=/; domain=.tenhopedido.com';
        }
      }
    } catch (e) {
      console.error('Erro ao sincronizar cookies:', e);
    }
  }
  
  // Executar a sincronização de cookies periodicamente
  setInterval(syncCookies, 2000);
  
  // Executar a sincronização de cookies imediatamente
  syncCookies();
  
  // Executar a sincronização de cookies antes de atualizar a página
  window.addEventListener('beforeunload', syncCookies);
  
  // Corrigir problemas com o objeto localStorage
  var originalGetItem = localStorage.getItem;
  localStorage.getItem = function(key) {
    var value = originalGetItem.call(this, key);
    if (key && key.includes('bubble_') && value) {
      try {
        var parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          // Substituir todas as ocorrências do domínio principal pelo subdomínio
          value = JSON.stringify(parsed).replace(new RegExp('${MAIN_DOMAIN}', 'g'), '${SUBDOMAIN}');
          localStorage.setItem(key, value);
        }
      } catch (e) {
        // Ignorar erros de parsing
      }
    }
    return value;
  };
  
  // Corrigir problemas com o objeto sessionStorage
  var originalSessionGetItem = sessionStorage.getItem;
  sessionStorage.getItem = function(key) {
    var value = originalSessionGetItem.call(this, key);
    if (key && key.includes('bubble_') && value) {
      try {
        var parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object') {
          // Substituir todas as ocorrências do domínio principal pelo subdomínio
          value = JSON.stringify(parsed).replace(new RegExp('${MAIN_DOMAIN}', 'g'), '${SUBDOMAIN}');
          sessionStorage.setItem(key, value);
        }
      } catch (e) {
        // Ignorar erros de parsing
      }
    }
    return value;
  };
</script>`;
            
            // Inserir o script após a tag <head>
            text = text.replace('</head>', interceptScript + '</head>');
          }
          
          // Substituir todas as referências ao domínio principal
          text = text.replace(new RegExp(`https://${MAIN_DOMAIN}`, 'g'), `https://${SUBDOMAIN}`);
          text = text.replace(new RegExp(`http://${MAIN_DOMAIN}`, 'g'), `https://${SUBDOMAIN}`);
          text = text.replace(new RegExp(`//${MAIN_DOMAIN}`, 'g'), `//${SUBDOMAIN}`);
          text = text.replace(new RegExp(`"${MAIN_DOMAIN}"`, 'g'), `"${SUBDOMAIN}"`);
          text = text.replace(new RegExp(`'${MAIN_DOMAIN}'`, 'g'), `'${SUBDOMAIN}'`);
          
          // Substituir referências em JSON
          if (contentType.includes('application/json')) {
            try {
              const jsonData = JSON.parse(text);
              text = JSON.stringify(jsonData).replace(new RegExp(MAIN_DOMAIN, 'g'), SUBDOMAIN);
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
    } catch (e) {
      return new Response('Erro ao acessar o servidor: ' + e.message, { status: 500 });
    }
  }
  
  // Se não for para o subdomínio, apenas passar a solicitação adiante
  return fetch(request);
}
