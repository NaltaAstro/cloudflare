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
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, X-Requested-With",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400"
        }
      })
    }
    
    // Clonar os cabeçalhos
    const newHeaders = new Headers(request.headers)
    newHeaders.set('Host', MAIN_DOMAIN)
    
    // Preservar cookies
    const cookieHeader = request.headers.get('Cookie')
    if (cookieHeader) {
      newHeaders.set('Cookie', cookieHeader)
    }
    
    // Obter o corpo da solicitação
    let requestBody = null
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const clone = request.clone()
        requestBody = await clone.arrayBuffer()
      } catch (e) {
        console.error('Erro ao obter o corpo da solicitação:', e)
      }
    }
    
    // Criar a nova solicitação
    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      body: requestBody,
      redirect: 'follow'
    })
    
    // Fazer a solicitação para o domínio principal
    try {
      const response = await fetch(newRequest)
      
      // Clonar a resposta para modificá-la
      const responseHeaders = new Headers(response.headers)
      
      // Processar cookies
      if (responseHeaders.has('Set-Cookie')) {
        const cookies = responseHeaders.getAll('Set-Cookie')
        responseHeaders.delete('Set-Cookie')
        
        for (const cookie of cookies) {
          // Substituir o domínio nos cookies
          let newCookie = cookie
            .replace(`Domain=${MAIN_DOMAIN}`, `Domain=${SUBDOMAIN}`)
          
          if (!newCookie.includes('Domain=')) {
            newCookie += `; Domain=${SUBDOMAIN}`
          }
          
          responseHeaders.append('Set-Cookie', newCookie)
        }
      }
      
      // Retornar a resposta modificada
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      })
    } catch (e) {
      return new Response('Erro ao acessar o servidor: ' + e.message, { status: 500 })
    }
  }
  
  // Se não for para o subdomínio, apenas passar a solicitação adiante
  return fetch(request)
}
