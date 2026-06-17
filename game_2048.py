import pygame
import random

pygame.init()

SIZE = 4
TILE = 110
GAP = 10
TOP = 90
WIDTH = SIZE * TILE + (SIZE + 1) * GAP
HEIGHT = WIDTH + TOP + 90

screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("2048")
clock = pygame.time.Clock()

font_big = pygame.font.SysFont(None, 54)
font = pygame.font.SysFont(None, 34)

board = [[0, 0, 0, 0] for _ in range(SIZE)]
score = 0
message = ""

colors = {
    0: (205, 193, 180),
    2: (238, 228, 218),
    4: (237, 224, 200),
    8: (242, 177, 121),
    16: (245, 149, 99),
    32: (246, 124, 95),
    64: (246, 94, 59),
    128: (237, 207, 114),
    256: (237, 204, 97),
    512: (237, 200, 80),
    1024: (237, 197, 63),
    2048: (237, 194, 46),
}


def add_tile():
    empty = []

    for y in range(SIZE):
        for x in range(SIZE):
            if board[y][x] == 0:
                empty.append((x, y))

    if empty:
        x, y = random.choice(empty)
        board[y][x] = 2


def reset_game():
    global board, score, message
    board = [[0, 0, 0, 0] for _ in range(SIZE)]
    score = 0
    message = ""
    add_tile()
    add_tile()


def move_line(line):
    global score

    numbers = [num for num in line if num != 0]
    result = []
    i = 0

    while i < len(numbers):
        if i + 1 < len(numbers) and numbers[i] == numbers[i + 1]:
            new_num = numbers[i] * 2
            score += new_num
            result.append(new_num)
            i += 2
        else:
            result.append(numbers[i])
            i += 1

    while len(result) < SIZE:
        result.append(0)

    return result


def move_left():
    global board
    old = [row[:] for row in board]
    board = [move_line(row) for row in board]
    return board != old


def move_right():
    global board
    old = [row[:] for row in board]
    board = [list(reversed(move_line(list(reversed(row))))) for row in board]
    return board != old


def move_up():
    global board
    old = [row[:] for row in board]

    for x in range(SIZE):
        line = [board[y][x] for y in range(SIZE)]
        moved = move_line(line)
        for y in range(SIZE):
            board[y][x] = moved[y]

    return board != old


def move_down():
    global board
    old = [row[:] for row in board]

    for x in range(SIZE):
        line = [board[y][x] for y in range(SIZE)]
        moved = list(reversed(move_line(list(reversed(line)))))
        for y in range(SIZE):
            board[y][x] = moved[y]

    return board != old


def can_move():
    for y in range(SIZE):
        for x in range(SIZE):
            if board[y][x] == 0:
                return True
            if x < SIZE - 1 and board[y][x] == board[y][x + 1]:
                return True
            if y < SIZE - 1 and board[y][x] == board[y + 1][x]:
                return True

    return False


def make_move(direction):
    global message

    moved = False

    if direction == "left":
        moved = move_left()
    if direction == "right":
        moved = move_right()
    if direction == "up":
        moved = move_up()
    if direction == "down":
        moved = move_down()

    if moved:
        add_tile()

    if any(2048 in row for row in board):
        message = "You win"
    elif not can_move():
        message = "Game over"


def draw_text(text, x, y, color=(70, 60, 50), big=False):
    image = font_big.render(text, True, color) if big else font.render(text, True, color)
    rect = image.get_rect(center=(x, y))
    screen.blit(image, rect)


def draw_game():
    screen.fill((250, 248, 239))
    draw_text("2048", 70, 45, big=True)
    draw_text("Score: " + str(score), WIDTH - 95, 45)

    for y in range(SIZE):
        for x in range(SIZE):
            value = board[y][x]
            color = colors.get(value, (60, 58, 50))
            px = GAP + x * (TILE + GAP)
            py = TOP + GAP + y * (TILE + GAP)
            rect = pygame.Rect(px, py, TILE, TILE)

            pygame.draw.rect(screen, color, rect, border_radius=8)

            if value:
                text_color = (255, 255, 255) if value >= 8 else (70, 60, 50)
                draw_text(str(value), rect.centerx, rect.centery, text_color, big=True)

    draw_text("Swipe or use arrows. R - restart.", WIDTH // 2, HEIGHT - 45)

    if message:
        draw_text(message, WIDTH // 2, HEIGHT - 75, (200, 60, 50), big=True)


reset_game()
start_pos = None

while True:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            exit()

        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_r:
                reset_game()
            if not message:
                if event.key == pygame.K_LEFT:
                    make_move("left")
                if event.key == pygame.K_RIGHT:
                    make_move("right")
                if event.key == pygame.K_UP:
                    make_move("up")
                if event.key == pygame.K_DOWN:
                    make_move("down")

        if event.type == pygame.MOUSEBUTTONDOWN:
            start_pos = event.pos

        if event.type == pygame.MOUSEBUTTONUP and start_pos and not message:
            end_pos = event.pos
            dx = end_pos[0] - start_pos[0]
            dy = end_pos[1] - start_pos[1]

            if abs(dx) > abs(dy):
                if dx > 30:
                    make_move("right")
                if dx < -30:
                    make_move("left")
            else:
                if dy > 30:
                    make_move("down")
                if dy < -30:
                    make_move("up")

            start_pos = None

    draw_game()
    pygame.display.update()
    clock.tick(60)
