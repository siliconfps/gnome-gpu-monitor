# GPU Monitor - GNOME Shell Extension

Extensão para GNOME Shell que exibe em tempo real o uso da GPU, VRAM, clocks, temperatura e consumo de energia diretamente na barra superior (top panel).

Suporte principal para **AMD** (driver amdgpu). Detecção básica para **NVIDIA** (hwmon).

## Funcionalidades

- **Painel superior:** uso da GPU (%), temperatura (°C), clock do núcleo (MHz)
- **Menu suspenso:** modelo da GPU, VRAM usada/total, GPU Clock, Memory Clock, Temperatura, Consumo (W)
- Cores dinâmicas: verde (baixo uso), amarelo (médio), vermelho (alto uso ≥70%)
- Atualização automática a cada 2 segundos

---

## Requisitos / Dependências

| Requisito | Detalhes |
|-----------|----------|
| **GNOME Shell** | Versão **42** ou superior |
| **AMD GPU** (recomendado) | Driver `amdgpu` carregado no kernel. Sem dependências externas — todos os dados vêm do sysfs. |
| **NVIDIA GPU** (limitado) | Suporte parcial via hwmon (temperatura, fan, power). Para métricas completas de uso/VRAM seria necessário `nvidia-smi`/NVML, *não implementado nesta versão*. |
| **Kernel Linux** | Qualquer kernel com suporte a sysfs (`/sys/class/drm`). Linux 5.x+ recomendado. |
| **Permissões** | Nenhuma permissão especial necessária. A extensão lê apenas arquivos do sysfs acessíveis a usuários comuns. |

> **Nota para NVIDIA:** A extensão detecta GPUs NVIDIA e pode exibir temperatura, velocidade da fan e consumo (se disponíveis via hwmon), mas **uso da GPU e VRAM não são suportados** sem integração NVML.

---

## Instalação

### Método 1: Instalação manual (recomendado)

```bash
# 1. Crie o diretório da extensão com o UUID correto
mkdir -p ~/.local/share/gnome-shell/extensions/gpu-monitor@eli

# 2. Copie todos os arquivos para lá
cp extension.js metadata.json stylesheet.css ~/.local/share/gnome-shell/extensions/gpu-monitor@eli/

# 3. Reinicie o GNOME Shell
#    Pressione Alt+F2, digite "r" e pressione Enter
#    Ou faça logout/login
```

### Método 2: Link simbólico (para desenvolvimento)

```bash
# Crie um link simbólico para não precisar copiar a cada alteração
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/gpu-monitor@eli
gnome-extensions enable gpu-monitor@eli
```

Após reiniciar o GNOME Shell (Alt+F2 → `r` → Enter), o indicador da GPU deve aparecer na barra superior.

### Verificação

```bash
# Confirme que a extensão está listada e habilitada
gnome-extensions list | grep gpu-monitor

# Para ver erros da extensão no Looking Glass:
# Pressione Alt+F2, digite "lg", vá até a aba "Extensions" e clique em "Show Errors"
```

---

## Diagnóstico de problemas

### A extensão aparece mas mostra ⚡ (sem dados)

Isso significa que nenhuma GPU AMD ou NVIDIA foi detectada pelo código. Verifique:

```bash
# Liste os devices DRM disponíveis
ls /sys/class/drm/

# Verifique o vendor ID da sua GPU
cat /sys/class/drm/card*/device/vendor

# AMD = 0x1002 | NVIDIA = 0x10de | Intel = 0x8086
```

- **Intel iGPU** (`0x8086`) não é suportada por esta extensão.
- Se você tem uma GPU AMD mas ela não aparece, verifique se o driver `amdgpu` está carregado:

```bash
lsmod | grep amdgpu
```

### Logs de erro do GNOME Shell

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i gpu
```

---

## Estrutura do projeto

```
gpu-monitor@eli/
├── extension.js      # Código principal da extensão
├── metadata.json     # Metadados (UUID, versão do GNOME Shell)
├── stylesheet.css    # Estilos do indicador e menu
├── LICENSE           # Licença MIT
└── README.md         # Este arquivo
```

## Licença

MIT — veja o arquivo `LICENSE`.
