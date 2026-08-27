// Autenticação e controle de sessão

// Remove pontos, traços e espaços do CPF
function limparCPF(cpf) {
  return (cpf || "").replace(/\D/g, "");
}

// O Supabase Auth exige e-mail; usamos um e-mail sintético baseado no CPF,
// invisível para o usuário (ele só digita o CPF)
function emailSinteticoDeCPF(cpf) {
  return `${limparCPF(cpf)}@estagioenf.local`;
}

async function fazerLogin(cpfDigitado, senha, papelEsperado) {
  const cpf = limparCPF(cpfDigitado);
  const email = emailSinteticoDeCPF(cpf);

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: senha,
  });

  if (error) {
    return { ok: false, mensagem: "CPF ou senha incorretos." };
  }

  // Busca o perfil vinculado a esse usuário
  const { data: perfil, error: erroPerfil } = await supabaseClient
    .from("perfis")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (erroPerfil || !perfil) {
    await supabaseClient.auth.signOut();
    return { ok: false, mensagem: "Perfil não encontrado para este usuário." };
  }

  if (perfil.papel !== papelEsperado) {
    await supabaseClient.auth.signOut();
    return { ok: false, mensagem: `Este acesso é para o perfil "${papelEsperado}". Sua conta é do tipo "${perfil.papel}".` };
  }

  return { ok: true, perfil };
}

async function fazerLogout() {
  await supabaseClient.auth.signOut();
  window.location.href = "/index.html";
}

// Redireciona para o login se não houver sessão ativa
// e confere se o papel do usuário bate com o esperado na página
async function protegerPagina(papelEsperado) {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = "/index.html";
    return null;
  }

  const { data: perfil, error } = await supabaseClient
    .from("perfis")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error || !perfil || perfil.papel !== papelEsperado) {
    await supabaseClient.auth.signOut();
    window.location.href = "/index.html";
    return null;
  }

  return perfil;
}

// Registra uma ação na tabela de auditoria
async function registrarAuditoria(usuarioId, acao, detalhes = {}) {
  await supabaseClient.from("auditoria").insert({
    usuario_id: usuarioId,
    acao: acao,
    detalhes: detalhes,
  });
}

// Cria o login de uma nova pessoa (preceptor ou aluno).
// CPF vira o login E a senha inicial; a pessoa é obrigada a trocar no 1º acesso.
async function criarAcessoPorCPF(cpfDigitado, nome, papel) {
  const cpf = limparCPF(cpfDigitado);

  if (cpf.length !== 11) {
    return { ok: false, mensagem: "CPF inválido. Digite os 11 números, sem pontos ou traços." };
  }

  const email = emailSinteticoDeCPF(cpf);

  // Guarda a sessão de quem está cadastrando (ex: supervisão), porque
  // criar um novo login troca a sessão ativa do navegador para o novo usuário
  const { data: { session: sessaoAnterior } } = await supabaseClient.auth.getSession();

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: cpf,
  });

  if (error) {
    if (error.message && error.message.toLowerCase().includes("already registered")) {
      return { ok: false, mensagem: "Já existe um cadastro com este CPF." };
    }
    return { ok: false, mensagem: "Erro ao criar acesso: " + error.message };
  }

  const { error: erroPerfil } = await supabaseClient.from("perfis").insert({
    id: data.user.id,
    nome: nome,
    papel: papel,
    cpf: cpf,
    senha_trocada: false,
  });

  // Restaura a sessão de quem estava cadastrando
  if (sessaoAnterior) {
    await supabaseClient.auth.setSession({
      access_token: sessaoAnterior.access_token,
      refresh_token: sessaoAnterior.refresh_token,
    });
  }

  if (erroPerfil) {
    return { ok: false, mensagem: "Erro ao salvar perfil: " + erroPerfil.message };
  }

  return { ok: true, usuarioId: data.user.id };
}

// Troca a senha do usuário logado e marca que já não precisa mais trocar
async function trocarSenha(novaSenha) {
  const { error } = await supabaseClient.auth.updateUser({ password: novaSenha });
  if (error) return { ok: false, mensagem: error.message };

  const { data: { user } } = await supabaseClient.auth.getUser();
  await supabaseClient.from("perfis").update({ senha_trocada: true }).eq("id", user.id);

  return { ok: true };
}
