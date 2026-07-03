from machine import Pin, I2C
from time import sleep
import sys

PCA9685_ADDR = 0x40
MODE1 = 0x00
PRESCALE = 0xFE
LED0_ON_L = 0x06

i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=100000)

def write8(reg, value):
    i2c.writeto_mem(PCA9685_ADDR, reg, bytes([value & 0xFF]))

def read8(reg):
    return i2c.readfrom_mem(PCA9685_ADDR, reg, 1)[0]

def set_pwm_freq(freq_hz):
    prescaleval = 25000000.0 / 4096.0 / freq_hz - 1.0
    prescale = int(prescaleval + 0.5)

    oldmode = read8(MODE1)
    sleepmode = (oldmode & 0x7F) | 0x10
    write8(MODE1, sleepmode)
    write8(PRESCALE, prescale)
    write8(MODE1, oldmode)
    sleep(0.005)
    write8(MODE1, oldmode | 0xA1)

def set_pwm(channel, on, off):
    reg = LED0_ON_L + 4 * channel
    data = bytes([
        on & 0xFF,
        (on >> 8) & 0xFF,
        off & 0xFF,
        (off >> 8) & 0xFF,
    ])
    i2c.writeto_mem(PCA9685_ADDR, reg, data)

def angle_to_ticks(angle):
    angle = max(0, min(180, int(angle)))
    pulse_us = 500 + (angle / 180) * 2000
    return int(pulse_us * 4096 / 20000)

def set_servo(channel, angle):
    set_pwm(channel, 0, angle_to_ticks(angle))

def center_all():
    set_servo(0, 90)
    set_servo(1, 90)

set_pwm_freq(50)
center_all()
print("PICO_READY")

while True:
    try:
        line = sys.stdin.readline().strip()
        if not line:
            continue

        parts = line.split()
        cmd = parts[0].upper()

        if cmd == "PING":
            print("PONG")

        elif cmd == "EAR" and len(parts) == 3:
            left = int(parts[1])
            right = int(parts[2])
            set_servo(0, left)
            set_servo(1, right)
            print("OK EAR", left, right)

        elif cmd == "STATUS":
            print("OK STATUS", " ".join(parts[1:]))

        else:
            print("ERR UNKNOWN_COMMAND", line)

    except Exception as e:
        print("ERR", e)