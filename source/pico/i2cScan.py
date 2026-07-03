from machine import Pin, I2C

i2c = I2C(0, scl=Pin(1), sda=Pin(0), freq=100000)

devices = i2c.scan()
print("I2C devices:", devices)
print([hex(d) for d in devices])