require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionFlagsBits,
  ActivityType, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  AuditLogEvent
} = require('discord.js');

// ===================== ILUSAOBOT =====================
const PREFIX = 'i!';
const EMBED_COLOR = 0x000000;
const PD_ROLE_ID = '1568103487387205693';
const ADMIN_ROLE_IDS = ['1567550448389460008', '1567550359604559972'];
const MEMBER_ROLE_ID = '1568059867963461752';
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const files = {
  warnings: path.join(DATA_DIR, 'warnings.json'),
  config: path.join(DATA_DIR, 'config.json'),
  economy: path.join(DATA_DIR, 'economy.json'),
  levels: path.join(DATA_DIR, 'levels.json'),
  tickets: path.join(DATA_DIR, 'tickets.json'),
  reminders: path.join(DATA_DIR, 'reminders.json')
};
function read(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function write(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
for (const f of Object.values(files)) if (!fs.existsSync(f)) write(f, {});
const db = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, read(f)]));
function save(key) { write(files[key], db[key]); }
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User]
});
if (!process.env.DISCORD_TOKEN) { console.error('DISCORD_TOKEN não encontrado no .env'); process.exit(1); }
const color = EMBED_COLOR;
const embed = (title, description) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(description || null).setFooter({ text: 'IlusaoBot • i!' }).setTimestamp();
const cut = (s, n = 1000) => String(s ?? '').slice(0, n) || '—';
const isAdmin = member => !!member && (member.id === member.guild.ownerId || ADMIN_ROLE_IDS.some(id => member.roles.cache.has(id)));
const isStaff = member => isAdmin(member); // Moderação e administração são exclusivas aos dois cargos administrativos.
const getTarget = async (message, token) => {
  const mentioned = message.mentions.members.first();
  if (mentioned) return mentioned;
  if (!token) return null;
  return message.guild.members.fetch(token.replace(/[<@!>]/g, '')).catch(() => null);
};
const getConfig = guildId => db.config[guildId] ||= {};
async function log(guild, title, description, fields = []) {
  const cfg = getConfig(guild.id); const channelId = cfg.logChannel || process.env.LOG_CHANNEL_ID;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.isTextBased()) await channel.send({ embeds: [embed(title, description).addFields(fields).setTimestamp()] }).catch(() => {});
}
function requireAdmin(message) { if (!isAdmin(message.member)) { message.reply('⛔ Este comando é exclusivo dos administradores autorizados.'); return false; } return true; }
function requireBotPerm(message, permission) { if (!message.guild.members.me.permissions.has(permission)) { message.reply('❌ Não tenho a permissão necessária.'); return false; } return true; }
function parseDuration(input) { const m = String(input || '').match(/^(\d+)(s|m|h|d)$/i); if (!m) return null; return Number(m[1]) * ({s:1000,m:60000,h:3600000,d:86400000}[m[2].toLowerCase()]); }
function money(gid, uid) { db.economy[gid] ||= {}; db.economy[gid][uid] ||= { wallet: 0, bank: 0, lastDaily: 0, lastWork: 0 }; return db.economy[gid][uid]; }
function levelData(gid, uid) { db.levels[gid] ||= {}; db.levels[gid][uid] ||= { xp: 0, level: 0, last: 0 }; return db.levels[gid][uid]; }

// ===================== EVENTOS / LOGS =====================
client.once('clientReady', () => {
  client.user.setPresence({ status: 'online', activities: [{ name: 'ilusão da vida de ter me criado', type: ActivityType.Watching }] });
  console.log(`IlusaoBot online: ${client.user.tag} | Prefixo ${PREFIX} | Embed #000000`);
});
client.on('guildMemberAdd', async member => {
  const cfg = getConfig(member.guild.id);
  if (cfg.autoRole) await member.roles.add(cfg.autoRole).catch(() => {});
  const ch = cfg.welcomeChannel ? await member.guild.channels.fetch(cfg.welcomeChannel).catch(() => null) : null;
  if (ch?.isTextBased()) { const welcome = embed('👋 Boas-vindas!', (cfg.welcomeMessage || 'Bem-vindo(a), {user}, ao **{server}**!').replaceAll('{user}', `<@${member.id}>`).replaceAll('{server}', member.guild.name)).setThumbnail(member.user.displayAvatarURL()); await ch.send({ embeds: [welcome] }).catch(() => {}); }
  await log(member.guild, '📥 Membro entrou', `${member.user.tag} (${member.id})`);
});
client.on('guildMemberRemove', member => log(member.guild, '📤 Membro saiu', `${member.user?.tag || member.id} (${member.id})`));
client.on('messageDelete', async msg => {
  if (!msg.guild || msg.author?.bot || msg.channelId === (getConfig(msg.guild.id).logChannel || process.env.LOG_CHANNEL_ID)) return;
  if (msg.partial) await msg.fetch().catch(() => {});
  await log(msg.guild, '🗑️ Mensagem apagada', `Autor: ${msg.author?.tag || 'desconhecido'}\nCanal: <#${msg.channelId}>\nConteúdo: ${cut(msg.content, 700)}`);
});
client.on('messageUpdate', async (oldMsg, newMsg) => {
  if (!newMsg.guild || newMsg.author?.bot || oldMsg.content === newMsg.content) return;
  if (oldMsg.partial) await oldMsg.fetch().catch(() => {}); if (newMsg.partial) await newMsg.fetch().catch(() => {});
  await log(newMsg.guild, '✏️ Mensagem editada', `Autor: ${newMsg.author?.tag || 'desconhecido'}\nCanal: <#${newMsg.channelId}>\nAntes: ${cut(oldMsg.content, 500)}\nDepois: ${cut(newMsg.content, 500)}`);
});
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;
  // XP por atividade com intervalo para evitar spam.
  const ld = levelData(message.guild.id, message.author.id);
  if (Date.now() - ld.last > 60000 && message.content.length > 3) {
    ld.last = Date.now(); ld.xp += 8 + Math.floor(Math.random() * 13);
    const needed = 100 + ld.level * 50;
    if (ld.xp >= needed) { ld.xp -= needed; ld.level++; message.channel.send(`🎉 <@${message.author.id}> subiu para o nível **${ld.level}**!`).catch(() => {}); }
    save('levels');
  }
  if (!message.content.startsWith(PREFIX)) return;
  const parts = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (parts.shift() || '').toLowerCase(); const args = parts;
  if (!command) return;
  const reply = text => message.reply({ content: text, allowedMentions: { repliedUser: false } });
  const target = () => getTarget(message, args[0]);
  if (!isAdmin(message.member) && !message.member.roles.cache.has(MEMBER_ROLE_ID)) return reply('⛔ Você precisa do cargo de membro autorizado para usar os comandos do bot.');
  try {
    // ================ PÚBLICOS: AJUDA / INFORMAÇÕES ================
    if (['help','ajuda','comandos'].includes(command)) {
      const e = embed('🤖 IlusaoBot • Central de comandos', 'Prefixo: `i!` • Embeds pretas\nComandos públicos disponíveis a todos os membros.');
      e.addFields(
        { name: '📌 Gerais', value: '`ping` `botinfo` `serverinfo` `userinfo @membro` `avatar [@membro]` `banner [@membro]` `servericon` `invite` `membros`' },
        { name: '🎮 Diversão', value: '`8ball pergunta` `coinflip` `dado [lados]` `escolher opção1 | opção2` `ship @a @b` `piada` `poll pergunta | opções`' },
        { name: '💰 Economia', value: '`daily` `work` `saldo [@membro]` `depositar valor` `sacar valor` `transferir @membro valor` `ranking`' },
        { name: '📈 Níveis', value: '`rank [@membro]` `top`' },
        { name: '🛡️ Moderação (administradores)', value: '`ban` `kick` `timeout` `untimeout` `warn` `warnings` `clearwarns` `purge` `lock` `unlock` `slowmode` `nick` `roleadd` `roleremove` `unban`' },
        { name: '⚙️ Administração (administradores)', value: '`pd` `say` `embed` `announce` `setlogs` `setwelcome` `setautorole` `setticket` `ticketpanel` `close` `giveaway` `gend` `greroll` `config` `setnickbot`' }
      ); e.setFooter({ text: 'IlusaoBot • Alguns comandos exigem permissões e permissões do bot.' }); return message.reply({ embeds: [e] });
    }
    if (command === 'ping') return reply(`🏓 Pong! Gateway: **${client.ws.ping}ms**`);
    if (command === 'botinfo') return message.reply({ embeds: [embed('🤖 Sobre o IlusaoBot', `**Tag:** ${client.user.tag}\n**Servidores:** ${client.guilds.cache.size}\n**Usuários em cache:** ${client.users.cache.size}\n**Uptime:** ${Math.floor(client.uptime / 3600000)}h ${Math.floor(client.uptime / 60000) % 60}min\n**Node:** ${process.version}\n**Discord.js:** ${require('discord.js').version}\n**Prefixo:** ${PREFIX}`).setThumbnail(client.user.displayAvatarURL())] });
    if (command === 'serverinfo') { const g = message.guild; const e = embed(`📊 ${g.name}`, `**Dono:** <@${g.ownerId}>\n**Criado:** <t:${Math.floor(g.createdTimestamp/1000)}:R>\n**Membros:** ${g.memberCount}\n**Canais:** ${g.channels.cache.size}\n**Cargos:** ${g.roles.cache.size}\n**Boosts:** ${g.premiumSubscriptionCount || 0}\n**ID:** ${g.id}`); if (g.iconURL()) e.setThumbnail(g.iconURL()); return message.reply({ embeds: [e] }); }
    if (command === 'userinfo') { const m = await target() || message.member; const u = m.user; return message.reply({ embeds: [embed(`👤 ${u.tag}`, `**ID:** ${u.id}\n**Conta criada:** <t:${Math.floor(u.createdTimestamp/1000)}:R>\n**Entrou:** ${m.joinedTimestamp ? `<t:${Math.floor(m.joinedTimestamp/1000)}:R>` : '—'}\n**Bot:** ${u.bot ? 'Sim' : 'Não'}\n**Cargos:** ${m.roles.cache.filter(r=>r.id!==message.guild.id).map(r=>r.toString()).join(', ') || 'Nenhum'}`).setThumbnail(u.displayAvatarURL({ size: 512 }))] }); }
    if (command === 'avatar') { const u = message.mentions.users.first() || message.author; return message.reply({ embeds: [embed(`🖼️ Avatar de ${u.tag}`, `[PNG](${u.displayAvatarURL({ extension:'png', size:1024 })}) • [JPG](${u.displayAvatarURL({ extension:'jpg', size:1024 })})`).setImage(u.displayAvatarURL({ size:1024 }))] }); }
    if (command === 'banner') { const u = await client.users.fetch(message.mentions.users.first()?.id || args[0] || message.author.id, { force: true }).catch(()=>message.author); if (!u.banner) return reply('Este usuário não possui banner.'); return message.reply({ embeds: [embed(`Banner de ${u.tag}`).setImage(u.bannerURL({ size:1024 }))] }); }
    if (command === 'servericon') { if (!message.guild.iconURL()) return reply('Este servidor não possui ícone.'); return message.reply({ embeds: [embed('Ícone do servidor').setImage(message.guild.iconURL({ size:1024 }))] }); }
    if (command === 'invite') return reply(`Convite de instalação: https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
    if (command === 'membros' || command === 'members') return reply(`👥 Este servidor possui **${message.guild.memberCount}** membros.`);
    if (command === '8ball') { if (!args.length) return reply('Faça uma pergunta.'); return reply(`🎱 ${['Sim, com certeza.','Não conte com isso.','Talvez.','As chances são boas.','Pergunte novamente mais tarde.','Definitivamente não.'][Math.floor(Math.random()*6)]}`); }
    if (command === 'coinflip') return reply(`🪙 Deu **${Math.random()<.5?'cara':'coroa'}**!`);
    if (command === 'dado') { const sides = Math.min(1000, Math.max(2, Number(args[0]) || 6)); return reply(`🎲 Você tirou **${1+Math.floor(Math.random()*sides)}** (d${sides}).`); }
    if (command === 'escolher') { const opts = args.join(' ').split('|').map(x=>x.trim()).filter(Boolean); if (opts.length<2) return reply('Use: `i!escolher opção 1 | opção 2`'); return reply(`🤔 Eu escolho: **${opts[Math.floor(Math.random()*opts.length)]}**`); }
    if (command === 'ship') { const users = [...message.mentions.users.values()].slice(0,2); if (users.length!==2) return reply('Mencione duas pessoas.'); const score = Math.floor(Math.random()*101); return reply(`💞 ${users[0]} + ${users[1]} = **${score}%** de compatibilidade!`); }
    if (command === 'piada') return reply(['Por que o livro de matemática ficou triste? Porque tinha muitos problemas.','O que o zero disse para o oito? Belo cinto!','Por que o computador foi ao médico? Estava com vírus.'][Math.floor(Math.random()*3)]);
    if (command === 'poll' || command === 'enquete') { const [question, optionsRaw] = args.join(' ').split('|').map(x=>x?.trim()); if (!question || !optionsRaw) return reply('Use: `i!poll Pergunta | opção 1 | opção 2`'); const opts = args.join(' ').split('|').slice(1).map(x=>x.trim()).filter(Boolean).slice(0,10); const e=embed(`📊 ${question}`, opts.map((x,i)=>`${['🇦','🇧','🇨','🇩','🇪','🇫','🇬','🇭','🇮','🇯'][i]} ${x}`).join('\n')); const msg=await message.channel.send({embeds:[e]}); for(let i=0;i<opts.length;i++) await msg.react(['🇦','🇧','🇨','🇩','🇪','🇫','🇬','🇭','🇮','🇯'][i]).catch(()=>{}); return; }

    // ================ ECONOMIA / NÍVEIS ================
    if (command === 'saldo' || command === 'bal') { const m=await target() || message.member; const a=money(message.guild.id,m.id); return reply(`💰 Saldo de **${m.user.username}**\nCarteira: **${a.wallet}** moedas\nBanco: **${a.bank}** moedas`); }
    if (command === 'daily') { const a=money(message.guild.id,message.author.id); if(Date.now()-a.lastDaily<86400000) return reply('⏳ Você já recebeu seu daily. Volte em 24 horas.'); a.lastDaily=Date.now(); a.wallet+=250; save('economy'); return reply('🎁 Você recebeu **250 moedas** diárias!'); }
    if (command === 'work') { const a=money(message.guild.id,message.author.id); if(Date.now()-a.lastWork<3600000) return reply('⏳ Você já trabalhou nesta hora.'); const amount=100+Math.floor(Math.random()*201); a.lastWork=Date.now(); a.wallet+=amount; save('economy'); return reply(`🧰 Você trabalhou e ganhou **${amount} moedas**!`); }
    if (command === 'depositar' || command === 'dep' || command === 'sacar' || command === 'withdraw') { const a=money(message.guild.id,message.author.id), n=Math.floor(Number(args[0])); if(!Number.isFinite(n)||n<=0) return reply('Informe um valor inteiro positivo.'); const deposit=['depositar','dep'].includes(command); if(deposit&&a.wallet<n) return reply('Você não tem esse valor na carteira.'); if(!deposit&&a.bank<n) return reply('Você não tem esse valor no banco.'); if(deposit){a.wallet-=n;a.bank+=n;}else{a.bank-=n;a.wallet+=n;} save('economy'); return reply(`✅ ${deposit?'Depositado':'Sacado'}: **${n} moedas**.`); }
    if (command === 'transferir' || command === 'pay') { const m=await target(), n=Math.floor(Number(args[1])); if(!m||m.id===message.author.id||!Number.isFinite(n)||n<=0) return reply('Use: `i!transferir @membro valor`'); const a=money(message.guild.id,message.author.id), b=money(message.guild.id,m.id); if(a.wallet<n) return reply('Saldo insuficiente.'); a.wallet-=n;b.wallet+=n;save('economy');return reply(`💸 Você transferiu **${n} moedas** para ${m}.`); }
    if (command === 'ranking' || command === 'top') { const rows=Object.entries(db.economy[message.guild.id]||{}).sort((a,b)=>(b[1].wallet+b[1].bank)-(a[1].wallet+a[1].bank)).slice(0,10); return message.reply({embeds:[embed('🏆 Ranking de riqueza',rows.map(([id,v],i)=>`**${i+1}.** <@${id}> — ${v.wallet+v.bank} moedas`).join('\n')||'Ainda não há dados.')]}); }
    if (command === 'rank') { const m=await target()||message.member, d=levelData(message.guild.id,m.id); return reply(`📈 **${m.user.username}**\nNível: **${d.level}**\nXP: **${d.xp}/${100+d.level*50}**`); }

    // ================ MODERAÇÃO (SOMENTE ADMIN IDS) ================
    const modCommands = ['ban','kick','timeout','mute','untimeout','unmute','warn','warnings','clearwarns','purge','clear','lock','unlock','slowmode','nick','roleadd','roleremove','unban','massrole'];
    if (modCommands.includes(command) && !requireAdmin(message)) return;
    if (command === 'ban') { const m=await target(); if(!m) return reply('Mencione um membro ou informe o ID.'); if(!m.bannable||m.id===message.author.id) return reply('Não posso banir esse membro (hierarquia/permissões).'); const reason=args.slice(1).join(' ')||'Sem motivo'; await m.ban({reason}); await log(message.guild,'🔨 Banimento',`${m.user.tag} banido por ${message.author.tag}. Motivo: ${reason}`); return reply(`🔨 ${m.user.tag} foi banido.`); }
    if (command === 'kick') { const m=await target(); if(!m) return reply('Mencione um membro ou informe o ID.'); if(!m.kickable||m.id===message.author.id) return reply('Não posso expulsar esse membro.'); const reason=args.slice(1).join(' ')||'Sem motivo'; await m.kick(reason); await log(message.guild,'👢 Expulsão',`${m.user.tag} expulso por ${message.author.tag}. Motivo: ${reason}`); return reply(`👢 ${m.user.tag} foi expulso.`); }
    if (command === 'timeout' || command === 'mute') { const m=await target(), ms=parseDuration(args[1]); if(!m||!ms||ms>28*86400000) return reply('Use: `i!timeout @membro 10m motivo` (máximo 28d).'); if(!m.moderatable) return reply('Não consigo aplicar timeout neste membro.'); await m.timeout(ms,args.slice(2).join(' ')||'Sem motivo'); await log(message.guild,'⏳ Timeout',`${m.user.tag} por ${args[1]} • ${message.author.tag}`); return reply(`⏳ ${m.user.tag} recebeu timeout de ${args[1]}.`); }
    if (command === 'untimeout' || command === 'unmute') { const m=await target(); if(!m) return reply('Mencione um membro.'); if(!m.moderatable) return reply('Não consigo remover o timeout.'); await m.timeout(null); return reply(`✅ Timeout removido de ${m.user.tag}.`); }
    if (command === 'warn') { const m=await target(), reason=args.slice(1).join(' '); if(!m||!reason) return reply('Use: `i!warn @membro motivo`'); db.warnings[message.guild.id] ||= {}; db.warnings[message.guild.id][m.id] ||= []; db.warnings[message.guild.id][m.id].push({reason,moderator:message.author.id,date:new Date().toISOString()}); save('warnings'); await log(message.guild,'⚠️ Advertência',`${m.user.tag}: ${reason}`); return reply(`⚠️ Advertência aplicada a ${m.user.tag}. Total: ${db.warnings[message.guild.id][m.id].length}`); }
    if (command === 'warnings') { const m=await target(); if(!m) return reply('Mencione um membro.'); const list=db.warnings[message.guild.id]?.[m.id]||[]; return message.reply({embeds:[embed(`⚠️ Advertências: ${m.user.tag}`,list.map((w,i)=>`**${i+1}.** ${w.reason} • <@${w.moderator}> • <t:${Math.floor(new Date(w.date).getTime()/1000)}:d>`).join('\n').slice(0,4000)||'Nenhuma advertência.')]}); }
    if (command === 'clearwarns') { const m=await target(); if(!m) return reply('Mencione um membro.'); if(db.warnings[message.guild.id]) delete db.warnings[message.guild.id][m.id]; save('warnings'); return reply(`✅ Advertências de ${m.user.tag} removidas.`); }
    if (command === 'purge' || command === 'clear') { const n=Math.min(100,Math.max(1,parseInt(args[0],10)||0)); if(!n) return reply('Use: `i!purge 20` (1 a 100).'); if(!requireBotPerm(message,PermissionFlagsBits.ManageMessages)) return; const deleted=await message.channel.bulkDelete(n+1,true); const m=await message.channel.send(`🧹 ${Math.max(0,deleted.size-1)} mensagens removidas.`); setTimeout(()=>m.delete().catch(()=>{}),4000); return; }
    if (command === 'lock' || command === 'unlock') { const locked=command==='lock'; const ch=message.mentions.channels.first()||message.channel; await ch.permissionOverwrites.edit(message.guild.roles.everyone,{SendMessages:locked?false:null}); return reply(`${locked?'🔒 Canal bloqueado':'🔓 Canal desbloqueado'}: ${ch}.`); }
    if (command === 'slowmode') { const sec=Math.min(21600,Math.max(0,parseInt(args[0],10)||0)); await message.channel.setRateLimitPerUser(sec); return reply(`🐢 Slowmode definido para **${sec} segundos**.`); }
    if (command === 'nick') { const m=await target(); if(!m) return reply('Mencione um membro.'); const nick=args.slice(1).join(' ')||null; await m.setNickname(nick); return reply(`✅ Apelido atualizado para ${m}.`); }
    if (command === 'roleadd' || command === 'roleremove') { const m=await target(), role=message.mentions.roles.first()||message.guild.roles.cache.get(args[1]); if(!m||!role) return reply('Use: `i!roleadd @membro @cargo`'); if(!role.editable) return reply('Não consigo gerenciar esse cargo pela hierarquia.'); await m.roles[command==='roleadd'?'add':'remove'](role); return reply(`✅ Cargo ${role} ${command==='roleadd'?'adicionado a':'removido de'} ${m}.`); }
    if (command === 'unban') { const id=args[0]?.replace(/[^0-9]/g,''); if(!id) return reply('Informe o ID do usuário.'); await message.guild.members.unban(id,args.slice(1).join(' ')||'Unban solicitado'); return reply(`✅ Usuário ${id} desbanido.`); }
    if (command === 'massrole') { const role=message.mentions.roles.first()||message.guild.roles.cache.get(args[0]); if(!role) return reply('Informe um cargo.'); await message.guild.members.fetch(); let count=0; for(const m of message.guild.members.cache.filter(x=>!x.user.bot).values()){if(!m.roles.cache.has(role.id)&&role.editable){await m.roles.add(role).catch(()=>{});count++;}} return reply(`✅ Cargo aplicado a ${count} membros.`); }

    // ================ ADMINISTRAÇÃO ================
    const adminCommands=['pd','say','embed','announce','setlogs','setwelcome','setautorole','setticket','ticketpanel','close','giveaway','gend','greroll','config','setnickbot'];
    if (adminCommands.includes(command) && !requireAdmin(message)) return;
    if (command === 'pd') { const m=await target(); if(!m) return reply('Use: `i!pd @usuario`'); const role=message.guild.roles.cache.get(PD_ROLE_ID); if(!role) return reply('Cargo Primeira Dama não encontrado.'); if(!role.editable) return reply('O cargo do bot precisa estar acima do cargo Primeira Dama.'); await m.roles.add(role,'Comando i!pd'); return reply(`👑 Cargo **${role.name}** atribuído a ${m}.`); }
    if (command === 'say') { const text=args.join(' '); if(!text) return reply('Informe o texto.'); await message.delete().catch(()=>{}); return message.channel.send({content:text,allowedMentions:{parse:[]}}); }
    if (command === 'embed') { const text=args.join(' '); if(!text) return reply('Informe o texto.'); return message.channel.send({embeds:[embed('📨 Mensagem',text)]}); }
    if (command === 'announce') { const ch=message.mentions.channels.first(), text=args.slice(1).join(' '); if(!ch?.isTextBased()||!text) return reply('Use: `i!announce #canal mensagem`'); await ch.send({embeds:[embed('📢 Comunicado',text)]}); return reply('✅ Comunicado enviado.'); }
    if (command === 'setlogs') { const ch=message.mentions.channels.first(); if(!ch) return reply('Mencione o canal de logs.'); getConfig(message.guild.id).logChannel=ch.id; save('config'); return reply(`✅ Canal de logs definido: ${ch}`); }
    if (command === 'setwelcome') { const ch=message.mentions.channels.first(); const text=args.slice(1).join(' '); if(!ch) return reply('Use: `i!setwelcome #canal [mensagem com {user} e {server}]`'); const cfg=getConfig(message.guild.id);cfg.welcomeChannel=ch.id;if(text)cfg.welcomeMessage=text;save('config');return reply(`✅ Boas-vindas configuradas em ${ch}.`); }
    if (command === 'setautorole') { const role=message.mentions.roles.first()||message.guild.roles.cache.get(args[0]); if(!role) return reply('Mencione um cargo.'); getConfig(message.guild.id).autoRole=role.id;save('config');return reply(`✅ Cargo automático: ${role}.`); }
    if (command === 'setticket') { const ch=message.mentions.channels.first(); if(!ch) return reply('Mencione a categoria de tickets.'); getConfig(message.guild.id).ticketCategory=ch.id;save('config');return reply(`✅ Categoria de tickets: ${ch.name}.`); }
    if (command === 'ticketpanel') { const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_create').setLabel('Abrir ticket').setStyle(ButtonStyle.Primary).setEmoji('🎫')); return message.channel.send({embeds:[embed('🎫 Atendimento','Clique no botão abaixo para abrir um ticket privado com a equipe.')],components:[row]}); }
    if (command === 'close') { if(!message.channel.name.startsWith('ticket-')) return reply('Este comando só funciona dentro de um ticket.'); await message.channel.send('🔒 Ticket será encerrado em 5 segundos.'); setTimeout(()=>message.channel.delete().catch(()=>{}),5000); return; }
    if (command === 'giveaway' || command === 'gend') { const duration=parseDuration(args[0]), winners=Math.min(10,Math.max(1,parseInt(args[1],10)||1)), prize=args.slice(2).join(' '); if(!duration||!prize) return reply('Use: `i!giveaway 1h 1 prêmio`'); const end=Date.now()+duration; const msg=await message.channel.send({embeds:[embed('🎉 SORTEIO',`**Prêmio:** ${prize}\n**Vencedores:** ${winners}\n**Termina:** <t:${Math.floor(end/1000)}:R>\nReaja com 🎉 para participar!`)]}); await msg.react('🎉'); setTimeout(async()=>{const fresh=await msg.fetch().catch(()=>null);if(!fresh)return;const reaction=fresh.reactions.cache.get('🎉');const users=reaction?await reaction.users.fetch():null;const entrants=users?users.filter(u=>!u.bot).map(u=>u):[];const picked=[];while(entrants.length&&picked.length<winners){picked.push(entrants.splice(Math.floor(Math.random()*entrants.length),1)[0]);}await message.channel.send(picked.length?`🎊 Parabéns ${picked.map(u=>`<@${u.id}>`).join(', ')}! Prêmio: **${prize}**`:`Sorteio encerrado sem participantes.`).catch(()=>{});},duration);return reply('✅ Sorteio criado.'); }
    if (command === 'greroll') { const id=args[0]; if(!id) return reply('Informe o ID da mensagem do sorteio.'); const msg=await message.channel.messages.fetch(id).catch(()=>null); if(!msg) return reply('Sorteio não encontrado neste canal.'); const reaction=msg.reactions.cache.get('🎉');const users=reaction?await reaction.users.fetch():null;const entrants=users?users.filter(u=>!u.bot).map(u=>u):[];if(!entrants.length)return reply('Não há participantes.');const winner=entrants[Math.floor(Math.random()*entrants.length)];return message.channel.send(`🎉 Novo vencedor: <@${winner.id}>!`); }
    if (command === 'config') { const c=getConfig(message.guild.id); return message.reply({embeds:[embed('⚙️ Configurações do servidor',`**Logs:** ${c.logChannel?`<#${c.logChannel}>`:'padrão do .env'}\n**Boas-vindas:** ${c.welcomeChannel?`<#${c.welcomeChannel}>`:'desativado'}\n**Cargo automático:** ${c.autoRole?`<@&${c.autoRole}>`:'desativado'}\n**Categoria tickets:** ${c.ticketCategory?`<#${c.ticketCategory}>`:'não definida'}`)]}); }
    if (command === 'setnickbot') { const nick=args.join(' '); if(!nick) return reply('Informe o apelido.'); await message.guild.members.me.setNickname(nick); return reply('✅ Apelido do bot atualizado.'); }

    return reply(`❓ Comando não encontrado. Use [0m[1mi!help[0m para ver os comandos.`);
  } catch (err) {
    console.error(`Erro em i!${command}:`, err);
    return reply(`❌ Não foi possível executar [0m[1mi!${command}[0m. Confira minhas permissões, a hierarquia dos cargos e os argumentos.`).catch(()=>{});
  }
});

// ===================== BOTÕES DE TICKET =====================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.guild) return;
  if (interaction.customId !== 'ticket_create') return;
  const existing = interaction.guild.channels.cache.find(c=>c.name===`ticket-${interaction.user.id}`);
  if(existing) return interaction.reply({content:`Você já possui um ticket: ${existing}`,ephemeral:true});
  const cfg=getConfig(interaction.guild.id);
  const channel=await interaction.guild.channels.create({name:`ticket-${interaction.user.id}`,
    type:ChannelType.GuildText, parent:cfg.ticketCategory||null,
    permissionOverwrites:[{id:interaction.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
      {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
      ...ADMIN_ROLE_IDS.map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}))]
  }).catch(()=>null);
  if(!channel) return interaction.reply({content:'Não consegui criar o ticket. Verifique minhas permissões.',ephemeral:true});
  await channel.send({content:`<@${interaction.user.id}> <@&${ADMIN_ROLE_IDS[0]}>`,embeds:[embed('🎫 Ticket aberto','Explique seu problema. A equipe responderá assim que possível.')],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Fechar ticket').setStyle(ButtonStyle.Danger))]});
  await interaction.reply({content:`Ticket criado: ${channel}`,ephemeral:true});
});
client.on('interactionCreate', async interaction => {
  if(!interaction.isButton()||interaction.customId!=='ticket_close')return;
  if(!isAdmin(interaction.member)&&!interaction.channel.name.endsWith(interaction.user.id))return interaction.reply({content:'Você não pode fechar este ticket.',ephemeral:true});
  await interaction.reply({content:'Ticket encerrado em 5 segundos.'});setTimeout(()=>interaction.channel.delete().catch(()=>{}),5000);
});

client.login(process.env.DISCORD_TOKEN).catch(err=>{console.error('Falha ao conectar o IlusaoBot:',err);process.exitCode=1;});
