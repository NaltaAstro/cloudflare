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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    })
  }
  
  // Criar uma nova URL apontando para o Bubble.io
  const url = new URL(request.url)
  const bubbleUrl = new URL(request.url)
  bubbleUrl.hostname = 'controle-bc.bubbleapps.io'
  
  // Clonar a solicitação com a nova URL
  const newRequest = new Request(bubbleUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow'
  })
  
  // Fazer a solicitação para o Bubble.io
  let response
  try {
    response = await fetch(newRequest)
  } catch (e) {
    return new Response('Erro ao acessar o servidor: ' + e.message, { status: 500 })
  }
  
  // Clonar a resposta para modificá-la
  const newHeaders = new Headers(response.headers)
  newHeaders.set('Access-Control-Allow-Origin', '*')
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  // Verificar o tipo de conteúdo
  const contentType = newHeaders.get('content-type') || ''
  
  // Se for texto ou JSON, modificar o conteúdo
  if (contentType.includes('text/') || 
      contentType.includes('application/json') || 
      contentType.includes('application/javascript')) {
    try {
      let text = await response.text()
      
      // Substituir todas as referências ao domínio do Bubble
      text = text.replace(/https:\/\/controle-bc\.bubbleapps\.io/g, 'https://worbyta.com')
      
      // Criar uma nova resposta com o texto modificado
      return new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      })
    } catch (e) {
      return new Response('Erro ao processar a resposta: ' + e.message, { status: 500 })
    }
  }
  
  // Para outros tipos de conteúdo, apenas passar adiante
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}
