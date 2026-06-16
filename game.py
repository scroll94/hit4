import pygame

pygame.init()
screen = pygame.display.set_mode((500, 500))
clock = pygame.time.Clock()

player = pygame.Rect(225, 400, 50, 50)
bullet = None
enemy = pygame.Rect(225, 50, 50, 50)

left_btn = pygame.Rect(20, 420, 90, 60)
right_btn = pygame.Rect(130, 420, 90, 60)
shoot_btn = pygame.Rect(360, 420, 120, 60)

while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            exit()

        if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
            bullet = pygame.Rect(player.x + 20, player.y, 10, 20)

        if event.type == pygame.MOUSEBUTTONDOWN:
            x, y = event.pos
            if shoot_btn.collidepoint(x, y):
                bullet = pygame.Rect(player.x + 20, player.y, 10, 20)

    keys = pygame.key.get_pressed()
    mouse_pressed = pygame.mouse.get_pressed()[0]
    mouse_pos = pygame.mouse.get_pos()
    
    if keys[pygame.K_a]:
        player.x -= 5
    if keys[pygame.K_d]:
        player.x += 5

    if mouse_pressed and left_btn.collidepoint(mouse_pos):
        player.x -= 5
    if mouse_pressed and right_btn.collidepoint(mouse_pos):
        player.x += 5

    if bullet:
        bullet.y -= 8

    if bullet and bullet.colliderect(enemy):
        enemy.x = 1000
        bullet = None

    screen.fill("black")
    pygame.draw.rect(screen, "blue", player)
    pygame.draw.rect(screen, "red", enemy)

    if bullet:
        pygame.draw.rect(screen, "yellow", bullet)

    pygame.draw.rect(screen, "gray", left_btn)
    pygame.draw.rect(screen, "gray", right_btn)
    pygame.draw.rect(screen, "gray", shoot_btn)

    font = pygame.font.SysFont(None, 32)
    screen.blit(font.render("<", True, "white"), (55, 438))
    screen.blit(font.render(">", True, "white"), (165, 438))
    screen.blit(font.render("FIRE", True, "white"), (390, 438))

    pygame.display.update()
    clock.tick(60)
