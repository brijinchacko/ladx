# 03, conveyor with jam detection

Exercises:

- a timer with a preset in milliseconds, which is where vendors disagree most
  and where a conversion is most likely to be quietly wrong
- a timer done bit read as a contact on a later rung
- a latched alarm, `setCoil` with no matching `resetCoil` in the fixture, which
  is deliberate: a health check should be able to notice that
