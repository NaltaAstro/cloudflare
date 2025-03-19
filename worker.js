addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Configurações
  const TARGET_URL_HOSTNAME = "controle-bc.bubbleapps.io";
  const REQUEST_HOSTNAME_ORIGINAL = "worbyta.com";
  
  // Verificar se é uma solicitação OPTIONS (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, X-Requested-With',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
      }
    })
  }
  
  // Obter a URL da solicitação
  const url = new URL(request.url);
  
  // Criar uma URL para o Bubble.io
  const bubbleUrl = new URL(url.pathname + url.search, `https://${TARGET_URL_HOSTNAME}`);
  
  // Clonar os cabeçalhos
  const newHeaders = new Headers(request.headers);
  newHeaders.set('Host', TARGET_URL_HOSTNAME);
  
  // Criar a nova solicitação
  const newRequest = new Request(bubbleUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual'
  });
  
  // Fazer a solicitação para o Bubble.io
  let response;
  try {
    response = await fetch(newRequest);
    
    // Lidar com redirecionamentos manualmente
    if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
      const location = response.headers.get('Location');
      if (location) {
        const newLocation = location.replace(TARGET_URL_HOSTNAME, REQUEST_HOSTNAME_ORIGINAL);
        const redirectHeaders = new Headers(response.headers);
        redirectHeaders.set('Location', newLocation);
        return new Response(null, {
          status: response.status,
          headers: redirectHeaders
        });
      }
    }
  } catch (e) {
    return new Response('Erro ao acessar o servidor: ' + e.message, { status: 500 });
  }
  
  // Clonar a resposta para modificá-la
  const responseHeaders = new Headers(response.headers);
  
  // Adicionar cabeçalhos CORS
  responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  responseHeaders.set('Access-Control-Allow-Credentials', 'true');
  
  // Processar cookies
  if (responseHeaders.has('Set-Cookie')) {
    const cookies = responseHeaders.getAll('Set-Cookie');
    responseHeaders.delete('Set-Cookie');
    
    for (const cookie of cookies) {
      let newCookie = cookie
        .replace(`Domain=${TARGET_URL_HOSTNAME}`, `Domain=${REQUEST_HOSTNAME_ORIGINAL}`)
        .replace(/Domain=\.bubbleapps\.io/gi, `Domain=${REQUEST_HOSTNAME_ORIGINAL}`);
      
      if (!newCookie.includes('Domain=')) {
        newCookie += `; Domain=${REQUEST_HOSTNAME_ORIGINAL}`;
      }
      
      responseHeaders.append('Set-Cookie', newCookie);
    }
  }
  
  // Verificar o tipo de conteúdo
  const contentType = responseHeaders.get('content-type') || '';
  
  // Se for texto, HTML, JavaScript ou JSON, modificar o conteúdo
  if (contentType.includes('text/') || 
      contentType.includes('application/json') || 
      contentType.includes('application/javascript')) {
    try {
      let text = await response.text();
      
      // Adicionar scripts de interceptação semelhantes ao CoAlias
      if (contentType.includes('text/html')) {
        const interceptScript = `
        <script id="worbyta_xhr_interceptor">
          // Interceptar XMLHttpRequest
          var xhr_original_open = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function() {
            if (arguments[1] !== undefined && typeof arguments[1] == 'string' && 
                arguments[1].includes("https://${TARGET_URL_HOSTNAME}")) {
              arguments[1] = arguments[1].replace("https://${TARGET_URL_HOSTNAME}", "https://${REQUEST_HOSTNAME_ORIGINAL}");
              console.log('XMLHttpRequest changed to ' + arguments[1]);
            }
            xhr_original_open.apply(this, arguments);
          }
          
          // Interceptar fetch
          const fetch_original = fetch;
          fetch = function(url, options) {
            if(url !== undefined && typeof url == 'string' && url.includes("https://${TARGET_URL_HOSTNAME}")) {
              url = url.replace("https://${TARGET_URL_HOSTNAME}", "https://${REQUEST_HOSTNAME_ORIGINAL}");
              console.log('fetch changed to ' + url);
            }
            return fetch_original.call(this, url, options);
          };
        </script>
        `;
        
        // Inserir o script após a tag <head>
        text = text.replace('</head>', interceptScript + '</head>');
      }
      
      // Substituir todas as referências ao domínio do Bubble
      text = text.replace(new RegExp(`https://${TARGET_URL_HOSTNAME}`, 'g'), `https://${REQUEST_HOSTNAME_ORIGINAL}`);
      text = text.replace(new RegExp(`http://${TARGET_URL_HOSTNAME}`, 'g'), `https://${REQUEST_HOSTNAME_ORIGINAL}`);
      text = text.replace(new RegExp(`//${TARGET_URL_HOSTNAME}`, 'g'), `//${REQUEST_HOSTNAME_ORIGINAL}`);
      text = text.replace(new RegExp(TARGET_URL_HOSTNAME, 'g'), REQUEST_HOSTNAME_ORIGINAL);
      
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
