addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Verificar se é uma solicitação OPTIONS (CORS preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400'
      }
    })
  }
  
  // Criar uma nova URL apontando para o Bubble.io
  const url = new URL(request.url)
  const bubbleUrl = new URL(request.url)
  bubbleUrl.hostname = 'controle-bc.bubbleapps.io'
  
  // Clonar os cabeçalhos e modificar o host
  const newHeaders = new Headers(request.headers)
  newHeaders.set('Host', 'controle-bc.bubbleapps.io')
  
  // Clonar a solicitação com a nova URL e cabeçalhos
  const newRequest = new Request(bubbleUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual', // Importante para controlar redirecionamentos
    credentials: 'include' // Incluir cookies
  })
  
  // Fazer a solicitação para o Bubble.io
  let response
  try {
    response = await fetch(newRequest)
  } catch (e) {
    return new Response('Erro ao acessar o servidor: ' + e.message, { status: 500 })
  }
  
  // Clonar a resposta para modificá-la
  const responseHeaders = new Headers(response.headers)
  
  // Adicionar cabeçalhos CORS
  responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*')
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie')
  responseHeaders.set('Access-Control-Allow-Credentials', 'true')
  
  // Processar cookies - modificar o domínio dos cookies
  const cookies = responseHeaders.getAll('Set-Cookie')
  if (cookies && cookies.length > 0) {
    responseHeaders.delete('Set-Cookie')
    
    for (const cookie of cookies) {
      // Substituir o domínio do cookie
      let newCookie = cookie
        .replace(/Domain=controle-bc\.bubbleapps\.io/gi, `Domain=worbyta.com`)
        .replace(/SameSite=None/gi, 'SameSite=Lax') // Ajustar SameSite para melhor compatibilidade
      
      // Se o cookie não tiver um domínio explícito, adicionar um
      if (!newCookie.includes('Domain=')) {
        newCookie += '; Domain=worbyta.com'
      }
      
      responseHeaders.append('Set-Cookie', newCookie)
    }
  }
  
  // Verificar o tipo de conteúdo
  const contentType = responseHeaders.get('content-type') || ''
  
  // Se for texto ou JSON, modificar o conteúdo
  if (contentType.includes('text/') || 
      contentType.includes('application/json') || 
      contentType.includes('application/javascript')) {
    try {
      let text = await response.text()
      
      // Substituir todas as referências ao domínio do Bubble
      text = text.replace(/https:\/\/controle-bc\.bubbleapps\.io/g, 'https://worbyta.com')
      
      // Substituir referências a cookies e domínios
      text = text.replace(/controle-bc\.bubbleapps\.io/g, 'worbyta.com')
      
      // Criar uma nova resposta com o texto modificado
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      })
    } catch (e) {
      return new Response('Erro ao processar a resposta: ' + e.message, { status: 500 })
    }
  }
  
  // Para outros tipos de conteúdo, apenas passar adiante
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  })
}
