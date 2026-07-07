from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap

OUT = Path('play_store_assets')
OUT.mkdir(exist_ok=True)

EMERALD = '#059669'
TEAL = '#0f766e'
 CYAN = '#0ea5e9'
DARK = '#0f172a'
MUTED = '#64748b'
WHITE = '#ffffff'
LIGHT = '#f8fafc'
BORDER = '#dbe4ee'
RED = '#dc2626'
ORANGE = '#ea580c'
PURPLE = '#7c3aed'
BLUE = '#2563eb'
PINK = '#db2777'
AMBER = '#d97706'

FONT_CANDIDATES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def get_font(size=32, bold=False):
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            pass
    return ImageFont.load_default()


def gradient_bg(size, top, bottom):
    w, h = size
    img = Image.new('RGB', size, top)
    draw = ImageDraw.Draw(img)
    for y in range(h):
        r1, g1, b1 = tuple(int(top[i:i+2], 16) for i in (1, 3, 5))
        r2, g2, b2 = tuple(int(bottom[i:i+2], 16) for i in (1, 3, 5))
        r = int(r1 + (r2 - r1) * (y / max(1, h - 1)))
        g = int(g1 + (g2 - g1) * (y / max(1, h - 1)))
        b = int(b1 + (b2 - b1) * (y / max(1, h - 1)))
        draw.line((0, y, w, y), fill=(r, g, b))
    return img


def rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_text(draw, xy, text, font, fill=WHITE, max_width=None, line_spacing=8):
    x, y = xy
    if max_width:
        words = text.split()
        lines = []
        current = ''
        for word in words:
            test = f'{current} {word}'.strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            if bbox[2] - bbox[0] <= max_width or not current:
                current = test
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
    else:
        lines = text.split('\n')

    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        bbox = draw.textbbox((x, y), line, font=font)
        y += (bbox[3] - bbox[1]) + line_spacing
    return y


def draw_logo(draw, center_x, top_y, scale=1.0):
    size = int(72 * scale)
    rounded_rect(draw, (center_x - size//2, top_y, center_x + size//2, top_y + size), radius=int(22 * scale), fill=WHITE)
    # simple emerald heart icon
    heart_font = get_font(int(34 * scale), bold=True)
    draw.text((center_x - int(16*scale), top_y + int(12*scale)), '♥', font=heart_font, fill=EMERALD)


def create_icon():
    img = gradient_bg((512, 512), EMERALD, TEAL)
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (56, 56, 456, 456), radius=110, fill='#ffffff22')
    rounded_rect(draw, (96, 96, 416, 416), radius=92, fill=WHITE)
    heart_font = get_font(150, bold=True)
    draw.text((176, 130), '♥', font=heart_font, fill=EMERALD)
    hw_font = get_font(72, bold=True)
    draw.text((142, 300), 'HW', font=hw_font, fill=DARK)
    img.save(OUT / 'icon-512.png')


def create_feature_graphic():
    img = gradient_bg((1024, 500), '#065f46', '#0f766e')
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (40, 40, 984, 460), radius=42, fill='#ffffff10')
    draw_logo(draw, 130, 90, 1.3)
    title_font = get_font(52, bold=True)
    sub_font = get_font(24, bold=False)
    draw.text((90, 195), 'HealthWallet', font=title_font, fill=WHITE)
    draw.text((94, 255), 'by Nexa', font=get_font(22, bold=False), fill='#d1fae5')
    draw_text(draw, (90, 305), 'Seu cofre inteligente de saúde com IA, família, medicamentos, emergência e compartilhamento seguro.', font=sub_font, fill='#ecfeff', max_width=470)

    phone = (690, 55, 930, 445)
    rounded_rect(draw, phone, radius=34, fill='#0b1220', outline='#8ce9cf', width=3)
    rounded_rect(draw, (710, 90, 910, 410), radius=26, fill=LIGHT)
    rounded_rect(draw, (726, 112, 894, 188), radius=20, fill=EMERALD)
    draw.text((742, 128), 'MedScore 82/100', font=get_font(24, bold=True), fill=WHITE)
    draw.text((742, 160), 'Exames + medicamentos + timeline', font=get_font(15), fill='#d1fae5')
    rounded_rect(draw, (726, 204, 894, 250), radius=16, fill=WHITE, outline=BORDER)
    draw.text((740, 220), 'Família & Idosos', font=get_font(22, bold=True), fill=DARK)
    rounded_rect(draw, (726, 266, 894, 312), radius=16, fill=WHITE, outline=BORDER)
    draw.text((740, 282), 'Lembretes de medicamentos', font=get_font(18, bold=True), fill=DARK)
    rounded_rect(draw, (726, 328, 894, 374), radius=16, fill='#fee2e2', outline='#fecaca')
    draw.text((740, 344), 'Ajuda Rápida / SOS', font=get_font(19, bold=True), fill=RED)
    img.save(OUT / 'feature-graphic-1024x500.png')


def phone_base(title, subtitle):
    img = gradient_bg((1080, 1920), '#f3fdfb', '#eef6ff')
    draw = ImageDraw.Draw(img)
    rounded_rect(draw, (60, 50, 1020, 1870), radius=52, fill=WHITE, outline=BORDER, width=2)
    rounded_rect(draw, (95, 85, 985, 210), radius=30, fill=EMERALD)
    draw_logo(draw, 185, 108, 0.75)
    draw.text((250, 110), 'HealthWallet', font=get_font(44, bold=True), fill=WHITE)
    draw.text((252, 160), title, font=get_font(26), fill='#d1fae5')
    draw.text((110, 240), subtitle, font=get_font(34, bold=True), fill=DARK)
    return img, draw


def footer_cta(draw):
    rounded_rect(draw, (130, 1740, 950, 1828), radius=28, fill=EMERALD)
    draw.text((255, 1770), 'Organize sua saúde com IA e cuidado familiar', font=get_font(28, bold=True), fill=WHITE)


def create_dashboard_shot():
    img, draw = phone_base('Dashboard principal', 'Seu cockpit diário de saúde')
    rounded_rect(draw, (120, 305, 960, 560), radius=40, fill='#065f46')
    draw.text((160, 350), 'MedScore', font=get_font(28, bold=True), fill='#a7f3d0')
    draw.text((160, 388), '82 / 100', font=get_font(78, bold=True), fill=WHITE)
    draw.text((160, 490), 'Confiança dos dados: 86%', font=get_font(26), fill='#d1fae5')
    rounded_rect(draw, (120, 590, 960, 710), radius=30, fill='#fee2e2')
    draw.text((160, 632), 'Ajuda Rápida • contatos • localização • Passport', font=get_font(26, bold=True), fill=RED)
    cards = [
        ('Próximo lembrete', 'Tomar Losartana às 08:00', BLUE),
        ('Último exame', 'Hemograma enviado hoje', PURPLE),
        ('Compartilhamentos', '2 acessos ativos', TEAL),
        ('Telemedicina', 'Consulta cardiologia sexta', AMBER),
    ]
    y = 750
    for i, (t, s, c) in enumerate(cards):
        x = 120 if i % 2 == 0 else 555
        yy = y + (i // 2) * 180
        rounded_rect(draw, (x, yy, x + 405, yy + 140), radius=26, fill=LIGHT, outline=BORDER)
        draw.text((x + 24, yy + 28), t, font=get_font(24, bold=True), fill=c)
        draw_text(draw, (x + 24, yy + 66), s, font=get_font(22), fill=DARK, max_width=340)
    footer_cta(draw)
    img.save(OUT / 'screenshot-01-dashboard.png')


def create_medscore_shot():
    img, draw = phone_base('MedScore Inteligente', 'Resumo visual com IA e prioridades')
    rounded_rect(draw, (120, 310, 960, 980), radius=42, fill='#ecfeff', outline='#c9f5ff')
    draw.text((160, 355), 'Health Score', font=get_font(30, bold=True), fill=TEAL)
    rounded_rect(draw, (350, 420, 730, 800), radius=190, fill='#ffffff', outline='#a7f3d0', width=16)
    draw.text((445, 515), '82', font=get_font(110, bold=True), fill=EMERALD)
    draw.text((438, 655), '/100', font=get_font(36), fill=MUTED)
    draw.text((310, 840), 'Tendência positiva +4', font=get_font(28, bold=True), fill=EMERALD)
    rounded_rect(draw, (120, 1030, 960, 1360), radius=30, fill=LIGHT, outline=BORDER)
    draw.text((160, 1075), 'Principais insights', font=get_font(30, bold=True), fill=DARK)
    bullets = [
        'Exames recentes aumentaram a confiança dos dados.',
        'Medicamentos ativos registrados e organizados.',
        'Próximo passo sugerido: repetir perfil lipídico.',
        'Compartilhar resumo profissional com seu médico.',
    ]
    yy = 1135
    for item in bullets:
        draw.text((165, yy), '•', font=get_font(34, bold=True), fill=EMERALD)
        yy = draw_text(draw, (195, yy), item, font=get_font(24), fill=DARK, max_width=710, line_spacing=6) + 10
    footer_cta(draw)
    img.save(OUT / 'screenshot-02-medscore.png')


def create_family_shot():
    img, draw = phone_base('Família & Idosos', 'Círculo de cuidado com acesso master')
    rounded_rect(draw, (120, 310, 960, 430), radius=30, fill='#eef2ff', outline='#c7d2fe')
    draw.text((160, 350), 'Familiar master acompanha saúde, medicamentos, exames e SOS.', font=get_font(25, bold=True), fill='#4338ca')
    members = [
        ('Pai • 74 anos', 'Contato emergência • Alertas de medicamentos', '#fce7f3', PINK),
        ('Ana • Filha', 'Acesso master • acompanha consultas e exames', '#dcfce7', EMERALD),
        ('Carlos • Cuidador', 'Recebe alertas e confirma rotina diária', '#eff6ff', BLUE),
    ]
    y = 470
    for name, desc, bg, c in members:
        rounded_rect(draw, (120, y, 960, y + 170), radius=28, fill=bg)
        draw.text((160, y + 34), name, font=get_font(30, bold=True), fill=c)
        draw_text(draw, (160, y + 82), desc, font=get_font(23), fill=DARK, max_width=700)
        y += 195
    rounded_rect(draw, (120, 1070, 960, 1320), radius=30, fill=LIGHT, outline=BORDER)
    draw.text((160, 1115), 'Alertas compartilhados', font=get_font(30, bold=True), fill=DARK)
    alerts = [
        'Lembrete de remédio do idoso',
        'Consulta ou exame importante',
        'Ajuda Rápida / SOS',
        'Acompanhamento diário do cuidador',
    ]
    yy = 1175
    for a in alerts:
        draw.text((165, yy), '•', font=get_font(30, bold=True), fill=EMERALD)
        draw.text((198, yy), a, font=get_font(24), fill=DARK)
        yy += 42
    footer_cta(draw)
    img.save(OUT / 'screenshot-03-familia-idosos.png')


def create_meds_shot():
    img, draw = phone_base('Medicamentos', 'Lembretes, estoque e confirmação')
    meds = [
        ('Losartana 50mg', '08:00 • Tomei • Estoque 12 dias', '#ecfdf5', EMERALD),
        ('Rosuvastatina 10mg', '20:00 • Alertar familiar se não confirmar', '#eff6ff', BLUE),
        ('Vitamina D', '2x por semana • Estoque baixo', '#fff7ed', ORANGE),
    ]
    y = 320
    for title, desc, bg, c in meds:
        rounded_rect(draw, (120, y, 960, y + 210), radius=30, fill=bg, outline=BORDER)
        draw.text((160, y + 34), title, font=get_font(30, bold=True), fill=c)
        draw_text(draw, (160, y + 84), desc, font=get_font(24), fill=DARK, max_width=710)
        rounded_rect(draw, (160, y + 138, 340, y + 182), radius=18, fill=EMERALD)
        draw.text((210, y + 148), 'Tomei', font=get_font(22, bold=True), fill=WHITE)
        rounded_rect(draw, (360, y + 138, 540, y + 182), radius=18, fill='#fde68a')
        draw.text((408, y + 148), 'Adiar', font=get_font(22, bold=True), fill='#92400e')
        rounded_rect(draw, (560, y + 138, 740, y + 182), radius=18, fill='#e5e7eb')
        draw.text((612, y + 148), 'Pulei', font=get_font(22, bold=True), fill=DARK)
        y += 240
    footer_cta(draw)
    img.save(OUT / 'screenshot-04-medicamentos.png')


def create_emergency_shot():
    img, draw = phone_base('Ajuda Rápida / SOS', 'Emergência, contatos e dados críticos')
    rounded_rect(draw, (120, 310, 960, 470), radius=34, fill='#fee2e2', outline='#fecaca')
    draw.text((190, 360), 'ACIONAR AJUDA', font=get_font(44, bold=True), fill=RED)
    draw.text((195, 416), 'Botão rápido para idosos, família e cuidadores', font=get_font(24), fill='#7f1d1d')
    rounded_rect(draw, (120, 520, 960, 930), radius=30, fill=LIGHT, outline=BORDER)
    draw.text((160, 565), 'Passport de emergência', font=get_font(30, bold=True), fill=DARK)
    info = [
        'Paciente: Henrique Campos',
        'Tipo sanguíneo: O+',
        'Alergias: não informadas',
        'Condições: acompanhamento preventivo',
        'Contato principal: familiar master',
    ]
    yy = 630
    for item in info:
        draw.text((165, yy), '•', font=get_font(30, bold=True), fill=RED)
        draw.text((200, yy), item, font=get_font(24), fill=DARK)
        yy += 50
    rounded_rect(draw, (120, 980, 960, 1240), radius=30, fill='#eff6ff', outline='#bfdbfe')
    draw.text((160, 1025), 'Ações rápidas', font=get_font(30, bold=True), fill=BLUE)
    actions = ['Ligar 192', 'Ligar contato principal', 'Abrir localização', 'Registrar evento na Timeline']
    yy = 1088
    for item in actions:
        draw.text((165, yy), '•', font=get_font(30, bold=True), fill=BLUE)
        draw.text((200, yy), item, font=get_font(24), fill=DARK)
        yy += 42
    footer_cta(draw)
    img.save(OUT / 'screenshot-05-ajuda-rapida.png')


def create_readme():
    content = '''# Google Play Assets - HealthWallet\n\nArquivos gerados automaticamente pelo workflow `Generate Google Play Assets`.\n\nConteúdo:\n- icon-512.png\n- feature-graphic-1024x500.png\n- screenshot-01-dashboard.png\n- screenshot-02-medscore.png\n- screenshot-03-familia-idosos.png\n- screenshot-04-medicamentos.png\n- screenshot-05-ajuda-rapida.png\n\nObservação: estes arquivos são assets promocionais iniciais. Para publicação final, ainda é recomendável substituir ou complementar com screenshots reais do app.\n'''
    (OUT / 'README.txt').write_text(content, encoding='utf-8')


def main():
    create_icon()
    create_feature_graphic()
    create_dashboard_shot()
    create_medscore_shot()
    create_family_shot()
    create_meds_shot()
    create_emergency_shot()
    create_readme()
    print(f'Assets generated in: {OUT.resolve()}')


if __name__ == '__main__':
    main()
