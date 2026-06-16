import pygame
import random

pygame.init()
screen = pygame.display.set_mode((800, 600))
clock = pygame.time.Clock()
font = pygame.font.SysFont(None, 40)

player = pygame.Rect(375, 470, 50, 50)
bullet = None
enemy = pygame.Rect(random.randint(0, 750), 60, 50, 50)
score = 0

left_btn = pygame.Rect(40, 520, 120, 60)
right_btn = pygame.Rect(180, 520, 120, 60)
shoot_btn = pygame.Rect(620, 520, 140, 60)

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
        enemy.x = random.randint(0, 750)
        enemy.y = random.randint(40, 220)
        bullet = None
        score += 1

    if player.x < 0:
        player.x = 0
    if player.x > 750:
        player.x = 750

    screen.fill("black")
    pygame.draw.rect(screen, "blue", player)
    pygame.draw.rect(screen, "red", enemy)

    if bullet:
        pygame.draw.rect(screen, "yellow", bullet)

    pygame.draw.rect(screen, "gray", left_btn)
    pygame.draw.rect(screen, "gray", right_btn)
    pygame.draw.rect(screen, "gray", shoot_btn)

    screen.blit(font.render("<", True, "white"), (85, 532))
    screen.blit(font.render(">", True, "white"), (225, 532))
    screen.blit(font.render("FIRE", True, "white"), (655, 532))
    screen.blit(font.render("Score: " + str(score), True, "white"), (20, 20))

    pygame.display.update()
    clock.tick(60)
