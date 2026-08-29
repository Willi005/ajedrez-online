"""Tests for token-based room management and turn ownership."""

import threading
import unittest

from server.protocol import TOKEN_ALPHABET, TOKEN_LENGTH
from server.rooms import INITIAL_TIME_SECONDS, RoomError, RoomRegistry


class FakeConnection:
    """Stand-in for a client socket: the registry only needs identity."""

    def __init__(self, label):
        self.label = label

    def __repr__(self):
        return f"<FakeConnection {self.label}>"


class CreateRoomTest(unittest.TestCase):
    def setUp(self):
        self.registry = RoomRegistry()

    def test_returns_a_token_from_the_unambiguous_alphabet(self):
        token = self.registry.create_room(FakeConnection("a"), "ana")

        self.assertEqual(len(token), TOKEN_LENGTH)
        self.assertTrue(all(char in TOKEN_ALPHABET for char in token))

    def test_creator_plays_white_and_the_room_waits_for_an_opponent(self):
        connection = FakeConnection("a")

        token = self.registry.create_room(connection, "ana")
        room = self.registry.get_room(token)

        self.assertEqual(room.status, "waiting")
        self.assertEqual(room.white.nickname, "ana")
        self.assertIs(room.white.connection, connection)
        self.assertIsNone(room.black)

    def test_issues_a_distinct_token_for_each_room(self):
        tokens = {self.registry.create_room(FakeConnection(i), "p") for i in range(50)}

        self.assertEqual(len(tokens), 50)

    def test_retries_when_the_generated_token_is_already_taken(self):
        # Force a collision: the factory hands out the same token twice, then a
        # different one. The registry must not overwrite the first room.
        tokens = iter(["AAAAA", "AAAAA", "BBBBB"])
        registry = RoomRegistry(token_factory=lambda: next(tokens))

        first = registry.create_room(FakeConnection("a"), "ana")
        second = registry.create_room(FakeConnection("b"), "beto")

        self.assertEqual(first, "AAAAA")
        self.assertEqual(second, "BBBBB")


class JoinRoomTest(unittest.TestCase):
    def setUp(self):
        self.registry = RoomRegistry()
        self.host = FakeConnection("host")
        self.token = self.registry.create_room(self.host, "ana")

    def test_second_player_joins_as_black_and_the_game_starts(self):
        guest = FakeConnection("guest")

        room = self.registry.join_room(self.token, guest, "beto")

        self.assertEqual(room.status, "playing")
        self.assertEqual(room.black.nickname, "beto")
        self.assertEqual(room.turn, "white")

    def test_rejects_an_unknown_token(self):
        with self.assertRaises(RoomError) as ctx:
            self.registry.join_room("ZZZZZ", FakeConnection("guest"), "beto")

        self.assertEqual(ctx.exception.code, "ROOM_NOT_FOUND")

    def test_rejects_a_third_player(self):
        self.registry.join_room(self.token, FakeConnection("guest"), "beto")

        with self.assertRaises(RoomError) as ctx:
            self.registry.join_room(self.token, FakeConnection("third"), "caro")

        self.assertEqual(ctx.exception.code, "ROOM_FULL")

    def test_rejects_a_connection_that_is_already_in_a_room(self):
        with self.assertRaises(RoomError) as ctx:
            self.registry.join_room(self.token, self.host, "ana otra vez")

        self.assertEqual(ctx.exception.code, "ALREADY_IN_ROOM")


class TurnOwnershipTest(unittest.TestCase):
    def setUp(self):
        self.registry = RoomRegistry()
        self.white = FakeConnection("white")
        self.black = FakeConnection("black")
        self.token = self.registry.create_room(self.white, "ana")
        self.registry.join_room(self.token, self.black, "beto")

    def test_white_moves_first_and_the_turn_passes_to_black(self):
        room, _, flagged = self.registry.record_move(self.white)

        self.assertEqual(room.turn, "black")
        self.assertIsNone(flagged)

    def test_rejects_a_move_from_the_player_whose_turn_it_is_not(self):
        with self.assertRaises(RoomError) as ctx:
            self.registry.record_move(self.black)

        self.assertEqual(ctx.exception.code, "NOT_YOUR_TURN")

    def test_rejects_a_move_from_a_connection_with_no_room(self):
        with self.assertRaises(RoomError) as ctx:
            self.registry.record_move(FakeConnection("stranger"))

        self.assertEqual(ctx.exception.code, "NOT_IN_ROOM")

    def test_rejects_a_move_before_the_opponent_arrives(self):
        registry = RoomRegistry()
        lonely = FakeConnection("lonely")
        registry.create_room(lonely, "ana")

        with self.assertRaises(RoomError) as ctx:
            registry.record_move(lonely)

        self.assertEqual(ctx.exception.code, "GAME_NOT_STARTED")


class FakeClock:
    """A monotonic clock the test drives by hand.

    The alternative is sleeping through a ten-minute game, so the registry takes
    its clock as an argument and every timing test moves time explicitly.
    """

    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


class ClockTest(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.registry = RoomRegistry(clock=self.clock)
        self.white = FakeConnection("white")
        self.black = FakeConnection("black")
        self.token = self.registry.create_room(self.white, "ana")

    def seat_black(self):
        return self.registry.join_room(self.token, self.black, "beto")

    def test_both_players_start_with_the_full_time(self):
        room = self.seat_black()

        left = room.time_left(self.clock())
        self.assertEqual(left["white"], INITIAL_TIME_SECONDS)
        self.assertEqual(left["black"], INITIAL_TIME_SECONDS)

    def test_the_clock_does_not_run_while_the_room_waits_for_an_opponent(self):
        room = self.registry.get_room(self.token)
        self.clock.advance(120)

        self.assertEqual(room.time_left(self.clock())["white"], INITIAL_TIME_SECONDS)

    def test_only_the_side_to_move_is_charged(self):
        room = self.seat_black()

        self.clock.advance(30)

        left = room.time_left(self.clock())
        self.assertAlmostEqual(left["white"], INITIAL_TIME_SECONDS - 30)
        self.assertEqual(left["black"], INITIAL_TIME_SECONDS)

    def test_moving_stops_your_clock_and_starts_the_other(self):
        self.seat_black()

        self.clock.advance(30)
        _, left, _ = self.registry.record_move(self.white)
        self.assertAlmostEqual(left["white"], INITIAL_TIME_SECONDS - 30)

        self.clock.advance(10)
        room = self.registry.get_room(self.token)
        after = room.time_left(self.clock())

        # White is no longer being charged; black now is.
        self.assertAlmostEqual(after["white"], INITIAL_TIME_SECONDS - 30)
        self.assertAlmostEqual(after["black"], INITIAL_TIME_SECONDS - 10)

    def test_time_never_goes_below_zero(self):
        room = self.seat_black()

        self.clock.advance(INITIAL_TIME_SECONDS + 500)

        self.assertEqual(room.time_left(self.clock())["white"], 0.0)

    def test_the_sweeper_finds_the_side_that_ran_out(self):
        self.seat_black()

        self.clock.advance(INITIAL_TIME_SECONDS + 1)
        expired = self.registry.expire_timeouts()

        self.assertEqual(len(expired), 1)
        room, loser = expired[0]
        self.assertEqual(room.token, self.token)
        self.assertEqual(loser, "white")
        self.assertEqual(room.status, "finished")

    def test_the_sweeper_reports_a_finished_room_only_once(self):
        self.seat_black()
        self.clock.advance(INITIAL_TIME_SECONDS + 1)

        self.registry.expire_timeouts()

        self.assertEqual(self.registry.expire_timeouts(), [])

    def test_the_sweeper_leaves_a_game_still_being_played_alone(self):
        self.seat_black()

        self.clock.advance(INITIAL_TIME_SECONDS - 1)

        self.assertEqual(self.registry.expire_timeouts(), [])

    def test_a_move_arriving_after_the_flag_fell_is_not_applied(self):
        self.seat_black()

        self.clock.advance(INITIAL_TIME_SECONDS + 1)
        room, left, flagged = self.registry.record_move(self.white)

        self.assertEqual(flagged, "white")
        self.assertEqual(left["white"], 0.0)
        # The turn did not change hands and the game is over: the move that
        # arrived was made after the game had already ended.
        self.assertEqual(room.turn, "white")
        self.assertEqual(room.status, "finished")

    def test_a_finished_game_holds_its_figures(self):
        room = self.seat_black()

        self.clock.advance(45)
        self.registry.leave(self.black)
        self.clock.advance(300)

        self.assertAlmostEqual(room.time_left(self.clock())["white"],
                               INITIAL_TIME_SECONDS - 45)


class OpponentLookupTest(unittest.TestCase):
    def setUp(self):
        self.registry = RoomRegistry()
        self.white = FakeConnection("white")
        self.black = FakeConnection("black")
        self.token = self.registry.create_room(self.white, "ana")
        self.registry.join_room(self.token, self.black, "beto")

    def test_finds_the_other_player(self):
        self.assertIs(self.registry.opponent_of(self.white), self.black)
        self.assertIs(self.registry.opponent_of(self.black), self.white)

    def test_returns_none_while_the_room_is_still_waiting(self):
        registry = RoomRegistry()
        lonely = FakeConnection("lonely")
        registry.create_room(lonely, "ana")

        self.assertIsNone(registry.opponent_of(lonely))


class LeaveRoomTest(unittest.TestCase):
    def setUp(self):
        self.registry = RoomRegistry()
        self.white = FakeConnection("white")
        self.black = FakeConnection("black")
        self.token = self.registry.create_room(self.white, "ana")
        self.registry.join_room(self.token, self.black, "beto")

    def test_returns_the_room_the_player_left(self):
        room = self.registry.leave(self.black)

        self.assertEqual(room.token, self.token)
        self.assertEqual(room.status, "finished")

    def test_discards_the_room_once_both_players_are_gone(self):
        self.registry.leave(self.black)
        self.registry.leave(self.white)

        self.assertIsNone(self.registry.get_room(self.token))

    def test_returns_none_for_a_connection_that_was_never_in_a_room(self):
        self.assertIsNone(self.registry.leave(FakeConnection("stranger")))

    def test_frees_the_connection_so_it_can_join_another_room(self):
        other = RoomRegistry()
        self.registry.leave(self.black)
        token = other.create_room(FakeConnection("host"), "caro")

        # Should not raise ALREADY_IN_ROOM.
        other.join_room(token, self.black, "beto")


class ConcurrencyTest(unittest.TestCase):
    def test_tokens_stay_unique_when_many_threads_create_rooms_at_once(self):
        registry = RoomRegistry()
        tokens = []
        tokens_lock = threading.Lock()

        def create():
            token = registry.create_room(FakeConnection(threading.get_ident()), "p")
            with tokens_lock:
                tokens.append(token)

        threads = [threading.Thread(target=create) for _ in range(40)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(len(tokens), 40)
        self.assertEqual(len(set(tokens)), 40)

    def test_only_one_of_two_racing_players_can_take_the_open_seat(self):
        registry = RoomRegistry()
        token = registry.create_room(FakeConnection("host"), "ana")
        outcomes = []
        outcomes_lock = threading.Lock()
        start = threading.Barrier(2)

        def join(label):
            start.wait()
            try:
                registry.join_room(token, FakeConnection(label), label)
                result = "joined"
            except RoomError as error:
                result = error.code
            with outcomes_lock:
                outcomes.append(result)

        threads = [threading.Thread(target=join, args=(f"p{i}",)) for i in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(sorted(outcomes), ["ROOM_FULL", "joined"])


if __name__ == "__main__":
    unittest.main()
