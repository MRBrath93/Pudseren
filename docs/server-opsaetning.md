# Opsætning af serveren

Produktionsserveren er en VPS hos Hetzner i Tyskland (EU), så data bliver i EU.

| | |
| --- | --- |
| Udbyder | Hetzner Cloud |
| Type | Delt vCPU, 1 vCPU, 1 GB RAM, 20 GB disk |
| System | Ubuntu 24.04 LTS |
| Login | Kun SSH-nøgle, brugeren `mikkel` |

IP-adressen står ikke her, fordi repoet kan blive offentligt.

## 1. Oprettelse

Serveren er oprettet i Hetzner Console med Ubuntu 24.04, offentlig IPv4 og IPv6,
og min offentlige SSH-nøgle (`~/.ssh/id_ed25519.pub`). Den private nøgle forlader aldrig min computer.

## 2. Opdatering og swap

```bash
apt update && apt upgrade -y
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
reboot
```

Serveren har kun 1 GB RAM. Swap på 2 GB forhindrer, at processer bliver stoppet,
når hukommelsen slipper op, fx når Vue-appen bygges.

## 3. Egen bruger i stedet for root

```bash
adduser mikkel
usermod -aG sudo mikkel
rsync --archive --chown=mikkel:mikkel ~/.ssh /home/mikkel
```

Det daglige arbejde sker som en almindelig bruger. Root-rettigheder lånes kun med `sudo`,
så en fejl eller et kompromitteret login ikke automatisk giver fuld kontrol.

## 4. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw enable
```

Alt er lukket udefra undtagen SSH. Web (80/443) åbnes, når Nginx installeres.
Databasen åbnes aldrig mod internettet.

## 5. SSH: kun nøgle, ingen root

```bash
printf 'PermitRootLogin no\nPasswordAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/01-pudseren.conf
sudo sshd -t && sudo systemctl restart ssh
```

Login med adgangskode og som root er slået fra. Det stopper automatiske angreb,
der prøver at gætte adgangskoder. Filen hedder `01-`, fordi SSH bruger den første værdi,
den finder, og Hetzners egen `50-cloud-init.conf` ellers ville vinde.

Testet: `ssh root@…` giver `Permission denied (publickey)`, `ssh mikkel@…` virker.

## 6. PostgreSQL

```bash
sudo apt install -y postgresql
sudo -u postgres psql -c "SHOW listen_addresses;"   # localhost
```

PostgreSQL 16 lytter kun på `localhost`, så databasen kan kun nås inde fra serveren.
Sammen med firewallen er den usynlig fra internettet.

### Brugere og databaser

| Database | Ejer | Bruges til |
| --- | --- | --- |
| `pudseren` | `pudseren` | Produktion (den rigtige app) |
| `pudseren_dev` | `pudseren_dev` | Udvikling fra min computer |
| `pudseren_test` | `pudseren_dev` | Automatiske tests (tømmes ved hver kørsel) |

```bash
openssl rand -hex 24   # én tilfældig adgangskode pr. bruger
sudo -u postgres createuser --pwprompt pudseren
sudo -u postgres createuser --pwprompt pudseren_dev
sudo -u postgres createdb -O pudseren pudseren
sudo -u postgres createdb -O pudseren_dev pudseren_dev
sudo -u postgres createdb -O pudseren_dev pudseren_test
```

Adgangskoderne skrives ved en prompt i stedet for i kommandoen, så de ikke havner i terminalens historik.
De ligger i en adgangskodemanager og i `.env`-filer, som git ignorerer.

### Mindste privilegium

```bash
sudo -u postgres psql \
  -c "REVOKE CONNECT ON DATABASE pudseren FROM PUBLIC;" \
  -c "REVOKE CONNECT ON DATABASE pudseren_dev FROM PUBLIC;" \
  -c "REVOKE CONNECT ON DATABASE pudseren_test FROM PUBLIC;"
```

Som standard må alle databasebrugere forbinde til alle databaser. Nu kan hver bruger kun forbinde
til sine egne. Udviklingsbrugeren kan altså ikke komme ind i produktionsdatabasen,
selv hvis dens adgangskode skulle slippe ud.
