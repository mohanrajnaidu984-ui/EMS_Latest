import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { EmojiImg, EmojiText } from './EmojiImg';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const RECENT_EMOJI_KEY = 'ems-chatbox-recent-emojis';
const MAX_RECENT_EMOJIS = 24;

/** WhatsApp-style categories with search keywords */
const EMOJI_CATEGORIES = [
    {
        id: 'smileys',
        title: 'Smileys & People',
        emojis: [
            { e: '😀', k: 'grinning happy smile' },
            { e: '😃', k: 'smiley happy' },
            { e: '😄', k: 'smile happy laugh' },
            { e: '😁', k: 'grin beaming' },
            { e: '😆', k: 'laughing satisfied' },
            { e: '😅', k: 'sweat smile nervous' },
            { e: '🤣', k: 'rofl rolling floor laughing' },
            { e: '😂', k: 'joy tears laugh crying' },
            { e: '🙂', k: 'slightly smiling' },
            { e: '🙃', k: 'upside down' },
            { e: '😉', k: 'wink' },
            { e: '😊', k: 'blush smiling happy' },
            { e: '😇', k: 'innocent angel halo' },
            { e: '🥰', k: 'smiling hearts love' },
            { e: '😍', k: 'heart eyes love' },
            { e: '🤩', k: 'star struck wow' },
            { e: '😘', k: 'kiss blowing' },
            { e: '😗', k: 'kissing' },
            { e: '😚', k: 'kissing closed eyes' },
            { e: '😙', k: 'kissing smiling' },
            { e: '🥲', k: 'smiling tear' },
            { e: '😋', k: 'yum delicious' },
            { e: '😛', k: 'tongue' },
            { e: '😜', k: 'wink tongue' },
            { e: '🤪', k: 'zany crazy' },
            { e: '😝', k: 'squinting tongue' },
            { e: '🤑', k: 'money mouth' },
            { e: '🤗', k: 'hugging' },
            { e: '🤭', k: 'hand over mouth' },
            { e: '🤫', k: 'shushing quiet' },
            { e: '🤔', k: 'thinking' },
            { e: '🤐', k: 'zipper mouth' },
            { e: '🤨', k: 'raised eyebrow' },
            { e: '😐', k: 'neutral' },
            { e: '😑', k: 'expressionless' },
            { e: '😶', k: 'no mouth' },
            { e: '😏', k: 'smirk' },
            { e: '😒', k: 'unamused' },
            { e: '🙄', k: 'eye roll' },
            { e: '😬', k: 'grimacing' },
            { e: '🤥', k: 'lying pinocchio' },
            { e: '😌', k: 'relieved' },
            { e: '😔', k: 'pensive sad' },
            { e: '😪', k: 'sleepy' },
            { e: '🤤', k: 'drooling' },
            { e: '😴', k: 'sleeping sleep zzz' },
            { e: '😷', k: 'mask sick' },
            { e: '🤒', k: 'thermometer sick fever' },
            { e: '🤕', k: 'bandage hurt' },
            { e: '🤢', k: 'nauseated sick' },
            { e: '🤮', k: 'vomit sick' },
            { e: '🤧', k: 'sneezing' },
            { e: '🥵', k: 'hot sweating' },
            { e: '🥶', k: 'cold freezing' },
            { e: '🥴', k: 'woozy drunk' },
            { e: '😵', k: 'dizzy' },
            { e: '🤯', k: 'exploding head mind blown' },
            { e: '🤠', k: 'cowboy' },
            { e: '🥳', k: 'party celebrate' },
            { e: '😎', k: 'sunglasses cool' },
            { e: '🤓', k: 'nerd glasses' },
            { e: '🧐', k: 'monocle' },
            { e: '😕', k: 'confused' },
            { e: '😟', k: 'worried' },
            { e: '🙁', k: 'slightly frowning' },
            { e: '☹️', k: 'frowning' },
            { e: '😮', k: 'open mouth surprised' },
            { e: '😯', k: 'hushed' },
            { e: '😲', k: 'astonished' },
            { e: '😳', k: 'flushed embarrassed' },
            { e: '🥺', k: 'pleading puppy eyes' },
            { e: '😦', k: 'frowning open mouth' },
            { e: '😧', k: 'anguished' },
            { e: '😨', k: 'fearful scared' },
            { e: '😰', k: 'anxious sweat' },
            { e: '😥', k: 'sad relieved' },
            { e: '😢', k: 'cry sad tear' },
            { e: '😭', k: 'sob crying loudly' },
            { e: '😱', k: 'scream fear' },
            { e: '😖', k: 'confounded' },
            { e: '😣', k: 'persevering' },
            { e: '😞', k: 'disappointed' },
            { e: '😓', k: 'downcast sweat' },
            { e: '😩', k: 'weary tired' },
            { e: '😫', k: 'tired' },
            { e: '🥱', k: 'yawn sleepy' },
            { e: '😤', k: 'triumph steam' },
            { e: '😡', k: 'pouting angry mad' },
            { e: '😠', k: 'angry' },
            { e: '🤬', k: 'cursing swearing' },
            { e: '😈', k: 'smiling devil' },
            { e: '👿', k: 'angry devil' },
            { e: '💀', k: 'skull dead' },
            { e: '☠️', k: 'skull crossbones' },
            { e: '💩', k: 'poop' },
            { e: '🤡', k: 'clown' },
            { e: '👻', k: 'ghost' },
            { e: '👽', k: 'alien' },
            { e: '👾', k: 'space invader' },
            { e: '🤖', k: 'robot' },
            { e: '😺', k: 'smiling cat' },
            { e: '😸', k: 'grinning cat' },
            { e: '😹', k: 'joy cat tears' },
            { e: '😻', k: 'heart eyes cat' },
            { e: '😼', k: 'smirk cat' },
            { e: '😽', k: 'kissing cat' },
            { e: '🙀', k: 'weary cat scream' },
            { e: '😿', k: 'crying cat' },
            { e: '😾', k: 'pouting cat' },
            { e: '🙈', k: 'see no evil monkey' },
            { e: '🙉', k: 'hear no evil monkey' },
            { e: '🙊', k: 'speak no evil monkey' },
            { e: '👋', k: 'wave hello bye' },
            { e: '🤚', k: 'raised back hand' },
            { e: '🖐', k: 'hand splayed' },
            { e: '✋', k: 'raised hand stop' },
            { e: '🖖', k: 'vulcan' },
            { e: '👌', k: 'ok hand' },
            { e: '🤌', k: 'pinched fingers' },
            { e: '🤏', k: 'pinching hand' },
            { e: '✌️', k: 'victory peace' },
            { e: '🤞', k: 'crossed fingers luck' },
            { e: '🤟', k: 'love you gesture' },
            { e: '🤘', k: 'rock on' },
            { e: '🤙', k: 'call me' },
            { e: '👈', k: 'point left' },
            { e: '👉', k: 'point right' },
            { e: '👆', k: 'point up' },
            { e: '👇', k: 'point down' },
            { e: '☝️', k: 'index up' },
            { e: '👍', k: 'thumbs up like yes' },
            { e: '👎', k: 'thumbs down dislike no' },
            { e: '✊', k: 'fist' },
            { e: '👊', k: 'punch' },
            { e: '🤛', k: 'left fist' },
            { e: '🤜', k: 'right fist' },
            { e: '👏', k: 'clap applause' },
            { e: '🙌', k: 'raised hands celebrate' },
            { e: '👐', k: 'open hands' },
            { e: '🤲', k: 'palms up' },
            { e: '🤝', k: 'handshake deal' },
            { e: '🙏', k: 'pray please thanks namaste' },
            { e: '✍️', k: 'writing' },
            { e: '💅', k: 'nail polish' },
            { e: '🤳', k: 'selfie' },
            { e: '💪', k: 'muscle strong' },
            { e: '🦾', k: 'mechanical arm' },
            { e: '🦵', k: 'leg' },
            { e: '🦶', k: 'foot' },
            { e: '👂', k: 'ear' },
            { e: '👃', k: 'nose' },
            { e: '🧠', k: 'brain' },
            { e: '👀', k: 'eyes look' },
            { e: '👁', k: 'eye' },
            { e: '👅', k: 'tongue' },
            { e: '👄', k: 'lips mouth' },
            { e: '💋', k: 'kiss mark' },
            { e: '🩸', k: 'blood drop' },
        ],
    },
    {
        id: 'animals',
        title: 'Animals & Nature',
        emojis: [
            { e: '🐶', k: 'dog puppy' },
            { e: '🐱', k: 'cat kitten' },
            { e: '🐭', k: 'mouse' },
            { e: '🐹', k: 'hamster' },
            { e: '🐰', k: 'rabbit bunny' },
            { e: '🦊', k: 'fox' },
            { e: '🐻', k: 'bear' },
            { e: '🐼', k: 'panda' },
            { e: '🐨', k: 'koala' },
            { e: '🐯', k: 'tiger' },
            { e: '🦁', k: 'lion' },
            { e: '🐮', k: 'cow' },
            { e: '🐷', k: 'pig' },
            { e: '🐸', k: 'frog' },
            { e: '🐵', k: 'monkey' },
            { e: '🐔', k: 'chicken' },
            { e: '🐧', k: 'penguin' },
            { e: '🐦', k: 'bird' },
            { e: '🐤', k: 'chick' },
            { e: '🦆', k: 'duck' },
            { e: '🦅', k: 'eagle' },
            { e: '🦉', k: 'owl' },
            { e: '🦇', k: 'bat' },
            { e: '🐺', k: 'wolf' },
            { e: '🐗', k: 'boar' },
            { e: '🐴', k: 'horse' },
            { e: '🦄', k: 'unicorn' },
            { e: '🐝', k: 'bee' },
            { e: '🐛', k: 'bug' },
            { e: '🦋', k: 'butterfly' },
            { e: '🐌', k: 'snail' },
            { e: '🐞', k: 'ladybug' },
            { e: '🐜', k: 'ant' },
            { e: '🦟', k: 'mosquito' },
            { e: '🦗', k: 'cricket' },
            { e: '🕷', k: 'spider' },
            { e: '🦂', k: 'scorpion' },
            { e: '🐢', k: 'turtle' },
            { e: '🐍', k: 'snake' },
            { e: '🦎', k: 'lizard' },
            { e: '🦖', k: 't rex dinosaur' },
            { e: '🦕', k: 'dinosaur' },
            { e: '🐙', k: 'octopus' },
            { e: '🦑', k: 'squid' },
            { e: '🦐', k: 'shrimp' },
            { e: '🦞', k: 'lobster' },
            { e: '🦀', k: 'crab' },
            { e: '🐡', k: 'blowfish' },
            { e: '🐠', k: 'tropical fish' },
            { e: '🐟', k: 'fish' },
            { e: '🐬', k: 'dolphin' },
            { e: '🐳', k: 'whale' },
            { e: '🦈', k: 'shark' },
            { e: '🐊', k: 'crocodile' },
            { e: '🐅', k: 'tiger' },
            { e: '🐆', k: 'leopard' },
            { e: '🦓', k: 'zebra' },
            { e: '🦍', k: 'gorilla' },
            { e: '🦧', k: 'orangutan' },
            { e: '🐘', k: 'elephant' },
            { e: '🦛', k: 'hippo' },
            { e: '🦏', k: 'rhino' },
            { e: '🐪', k: 'camel' },
            { e: '🦒', k: 'giraffe' },
            { e: '🦘', k: 'kangaroo' },
            { e: '🐃', k: 'water buffalo' },
            { e: '🐂', k: 'ox' },
            { e: '🐄', k: 'cow' },
            { e: '🐎', k: 'racehorse' },
            { e: '🐖', k: 'pig' },
            { e: '🐏', k: 'ram' },
            { e: '🐑', k: 'sheep' },
            { e: '🦙', k: 'llama' },
            { e: '🐐', k: 'goat' },
            { e: '🦌', k: 'deer' },
            { e: '🐕', k: 'dog' },
            { e: '🐩', k: 'poodle' },
            { e: '🦮', k: 'guide dog' },
            { e: '🐈', k: 'cat' },
            { e: '🐓', k: 'rooster' },
            { e: '🦃', k: 'turkey' },
            { e: '🦚', k: 'peacock' },
            { e: '🦜', k: 'parrot' },
            { e: '🦢', k: 'swan' },
            { e: '🦩', k: 'flamingo' },
            { e: '🕊', k: 'dove peace' },
            { e: '🐇', k: 'rabbit' },
            { e: '🦝', k: 'raccoon' },
            { e: '🦨', k: 'skunk' },
            { e: '🦡', k: 'badger' },
            { e: '🦦', k: 'otter' },
            { e: '🦥', k: 'sloth' },
            { e: '🐁', k: 'mouse' },
            { e: '🐀', k: 'rat' },
            { e: '🐿', k: 'chipmunk' },
            { e: '🦔', k: 'hedgehog' },
            { e: '🐾', k: 'paw prints' },
            { e: '🐉', k: 'dragon' },
            { e: '🌵', k: 'cactus' },
            { e: '🎄', k: 'christmas tree' },
            { e: '🌲', k: 'evergreen tree' },
            { e: '🌳', k: 'deciduous tree' },
            { e: '🌴', k: 'palm tree' },
            { e: '🌱', k: 'seedling' },
            { e: '🌿', k: 'herb' },
            { e: '☘️', k: 'shamrock' },
            { e: '🍀', k: 'four leaf clover luck' },
            { e: '🎋', k: 'bamboo' },
            { e: '🍃', k: 'leaves' },
            { e: '🍂', k: 'fallen leaf' },
            { e: '🍁', k: 'maple leaf' },
            { e: '🍄', k: 'mushroom' },
            { e: '🌾', k: 'sheaf rice' },
            { e: '💐', k: 'bouquet flowers' },
            { e: '🌷', k: 'tulip' },
            { e: '🌹', k: 'rose' },
            { e: '🥀', k: 'wilted flower' },
            { e: '🌺', k: 'hibiscus' },
            { e: '🌸', k: 'cherry blossom' },
            { e: '🌼', k: 'blossom' },
            { e: '🌻', k: 'sunflower' },
            { e: '🌞', k: 'sun face' },
            { e: '🌝', k: 'full moon face' },
            { e: '🌛', k: 'first quarter moon' },
            { e: '🌜', k: 'last quarter moon' },
            { e: '🌚', k: 'new moon face' },
            { e: '🌕', k: 'full moon' },
            { e: '🌖', k: 'waning gibbous' },
            { e: '🌗', k: 'last quarter' },
            { e: '🌘', k: 'waning crescent' },
            { e: '🌑', k: 'new moon' },
            { e: '🌒', k: 'waxing crescent' },
            { e: '🌓', k: 'first quarter' },
            { e: '🌔', k: 'waxing gibbous' },
            { e: '🌙', k: 'crescent moon' },
            { e: '🌎', k: 'earth americas' },
            { e: '🌍', k: 'earth africa' },
            { e: '🌏', k: 'earth asia' },
            { e: '🪐', k: 'saturn planet' },
            { e: '💫', k: 'dizzy star' },
            { e: '⭐', k: 'star' },
            { e: '🌟', k: 'glowing star' },
            { e: '✨', k: 'sparkles' },
            { e: '⚡', k: 'zap lightning' },
            { e: '☄️', k: 'comet' },
            { e: '💥', k: 'boom collision' },
            { e: '🔥', k: 'fire hot lit' },
            { e: '🌪', k: 'tornado' },
            { e: '🌈', k: 'rainbow' },
            { e: '☀️', k: 'sun sunny' },
            { e: '🌤', k: 'sun behind cloud' },
            { e: '⛅', k: 'partly cloudy' },
            { e: '☁️', k: 'cloud' },
            { e: '🌧', k: 'rain cloud' },
            { e: '⛈', k: 'thunderstorm' },
            { e: '🌩', k: 'lightning' },
            { e: '❄️', k: 'snowflake cold' },
            { e: '☃️', k: 'snowman' },
            { e: '⛄', k: 'snowman without snow' },
            { e: '🌬', k: 'wind face' },
            { e: '💨', k: 'dash wind' },
            { e: '💧', k: 'droplet water' },
            { e: '💦', k: 'sweat droplets' },
            { e: '☔', k: 'umbrella rain' },
            { e: '☂️', k: 'umbrella' },
            { e: '🌊', k: 'ocean wave' },
            { e: '🌫', k: 'fog' },
        ],
    },
    {
        id: 'food',
        title: 'Food & Drink',
        emojis: [
            { e: '🍎', k: 'apple red' },
            { e: '🍐', k: 'pear' },
            { e: '🍊', k: 'orange tangerine' },
            { e: '🍋', k: 'lemon' },
            { e: '🍌', k: 'banana' },
            { e: '🍉', k: 'watermelon' },
            { e: '🍇', k: 'grapes' },
            { e: '🍓', k: 'strawberry' },
            { e: '🫐', k: 'blueberries' },
            { e: '🍈', k: 'melon' },
            { e: '🍒', k: 'cherries' },
            { e: '🍑', k: 'peach' },
            { e: '🥭', k: 'mango' },
            { e: '🍍', k: 'pineapple' },
            { e: '🥥', k: 'coconut' },
            { e: '🥝', k: 'kiwi' },
            { e: '🍅', k: 'tomato' },
            { e: '🍆', k: 'eggplant' },
            { e: '🥑', k: 'avocado' },
            { e: '🥦', k: 'broccoli' },
            { e: '🥬', k: 'leafy greens' },
            { e: '🥒', k: 'cucumber' },
            { e: '🌶', k: 'chili hot pepper' },
            { e: '🫑', k: 'bell pepper' },
            { e: '🌽', k: 'corn' },
            { e: '🥕', k: 'carrot' },
            { e: '🫒', k: 'olive' },
            { e: '🧄', k: 'garlic' },
            { e: '🧅', k: 'onion' },
            { e: '🥔', k: 'potato' },
            { e: '🍠', k: 'sweet potato' },
            { e: '🥐', k: 'croissant' },
            { e: '🥯', k: 'bagel' },
            { e: '🍞', k: 'bread' },
            { e: '🥖', k: 'baguette' },
            { e: '🥨', k: 'pretzel' },
            { e: '🧀', k: 'cheese' },
            { e: '🥚', k: 'egg' },
            { e: '🍳', k: 'cooking fried egg' },
            { e: '🧈', k: 'butter' },
            { e: '🥞', k: 'pancakes' },
            { e: '🧇', k: 'waffle' },
            { e: '🥓', k: 'bacon' },
            { e: '🥩', k: 'steak meat' },
            { e: '🍗', k: 'poultry leg chicken' },
            { e: '🍖', k: 'meat bone' },
            { e: '🦴', k: 'bone' },
            { e: '🌭', k: 'hot dog' },
            { e: '🍔', k: 'hamburger burger' },
            { e: '🍟', k: 'fries' },
            { e: '🍕', k: 'pizza' },
            { e: '🫓', k: 'flatbread' },
            { e: '🥪', k: 'sandwich' },
            { e: '🥙', k: 'stuffed flatbread' },
            { e: '🧆', k: 'falafel' },
            { e: '🌮', k: 'taco' },
            { e: '🌯', k: 'burrito' },
            { e: '🥗', k: 'salad' },
            { e: '🥘', k: 'paella shallow pan' },
            { e: '🫕', k: 'fondue' },
            { e: '🥫', k: 'canned food' },
            { e: '🍝', k: 'spaghetti pasta' },
            { e: '🍜', k: 'ramen noodles' },
            { e: '🍲', k: 'stew pot' },
            { e: '🍛', k: 'curry' },
            { e: '🍣', k: 'sushi' },
            { e: '🍱', k: 'bento' },
            { e: '🥟', k: 'dumpling' },
            { e: '🦪', k: 'oyster' },
            { e: '🍤', k: 'fried shrimp' },
            { e: '🍙', k: 'rice ball' },
            { e: '🍚', k: 'rice' },
            { e: '🍘', k: 'rice cracker' },
            { e: '🍥', k: 'fish cake' },
            { e: '🥠', k: 'fortune cookie' },
            { e: '🥮', k: 'moon cake' },
            { e: '🍢', k: 'oden' },
            { e: '🍡', k: 'dango' },
            { e: '🍧', k: 'shaved ice' },
            { e: '🍨', k: 'ice cream' },
            { e: '🍦', k: 'soft ice cream' },
            { e: '🥧', k: 'pie' },
            { e: '🧁', k: 'cupcake' },
            { e: '🍰', k: 'cake shortcake' },
            { e: '🎂', k: 'birthday cake' },
            { e: '🍮', k: 'custard' },
            { e: '🍭', k: 'lollipop' },
            { e: '🍬', k: 'candy' },
            { e: '🍫', k: 'chocolate' },
            { e: '🍿', k: 'popcorn' },
            { e: '🍩', k: 'doughnut donut' },
            { e: '🍪', k: 'cookie' },
            { e: '🌰', k: 'chestnut' },
            { e: '🥜', k: 'peanuts' },
            { e: '🍯', k: 'honey' },
            { e: '🥛', k: 'milk' },
            { e: '🍼', k: 'baby bottle' },
            { e: '☕', k: 'coffee tea hot' },
            { e: '🫖', k: 'teapot' },
            { e: '🍵', k: 'tea' },
            { e: '🧃', k: 'juice box' },
            { e: '🥤', k: 'cup straw' },
            { e: '🧋', k: 'bubble tea' },
            { e: '🍶', k: 'sake' },
            { e: '🍺', k: 'beer' },
            { e: '🍻', k: 'beers cheers' },
            { e: '🥂', k: 'champagne cheers' },
            { e: '🍷', k: 'wine' },
            { e: '🥃', k: 'tumbler glass whiskey' },
            { e: '🍸', k: 'cocktail' },
            { e: '🍹', k: 'tropical drink' },
            { e: '🧉', k: 'mate' },
            { e: '🍾', k: 'champagne bottle' },
            { e: '🧊', k: 'ice cube' },
            { e: '🥄', k: 'spoon' },
            { e: '🍴', k: 'fork knife' },
            { e: '🍽', k: 'plate utensils' },
            { e: '🥣', k: 'bowl spoon' },
            { e: '🥡', k: 'takeout box' },
            { e: '🥢', k: 'chopsticks' },
            { e: '🧂', k: 'salt' },
        ],
    },
    {
        id: 'activity',
        title: 'Activity',
        emojis: [
            { e: '⚽', k: 'soccer football' },
            { e: '🏀', k: 'basketball' },
            { e: '🏈', k: 'american football' },
            { e: '⚾', k: 'baseball' },
            { e: '🥎', k: 'softball' },
            { e: '🎾', k: 'tennis' },
            { e: '🏐', k: 'volleyball' },
            { e: '🏉', k: 'rugby' },
            { e: '🥏', k: 'flying disc frisbee' },
            { e: '🎱', k: 'billiards pool 8ball' },
            { e: '🪀', k: 'yo yo' },
            { e: '🏓', k: 'ping pong' },
            { e: '🏸', k: 'badminton' },
            { e: '🏒', k: 'ice hockey' },
            { e: '🏑', k: 'field hockey' },
            { e: '🥍', k: 'lacrosse' },
            { e: '🏏', k: 'cricket' },
            { e: '🪃', k: 'boomerang' },
            { e: '🥅', k: 'goal net' },
            { e: '⛳', k: 'golf' },
            { e: '🪁', k: 'kite' },
            { e: '🏹', k: 'bow arrow' },
            { e: '🎣', k: 'fishing' },
            { e: '🤿', k: 'diving mask' },
            { e: '🥊', k: 'boxing' },
            { e: '🥋', k: 'martial arts' },
            { e: '🎽', k: 'running shirt' },
            { e: '🛹', k: 'skateboard' },
            { e: '🛼', k: 'roller skate' },
            { e: '🛷', k: 'sled' },
            { e: '⛸', k: 'ice skate' },
            { e: '🥌', k: 'curling' },
            { e: '🎿', k: 'ski' },
            { e: '⛷', k: 'skier' },
            { e: '🏂', k: 'snowboarder' },
            { e: '🪂', k: 'parachute' },
            { e: '🏋️', k: 'weight lifting gym' },
            { e: '🤼', k: 'wrestling' },
            { e: '🤸', k: 'cartwheel gymnastics' },
            { e: '⛹️', k: 'bouncing ball' },
            { e: '🤺', k: 'fencing' },
            { e: '🤾', k: 'handball' },
            { e: '🏌️', k: 'golfing' },
            { e: '🏇', k: 'horse racing' },
            { e: '🧘', k: 'yoga meditation' },
            { e: '🏄', k: 'surfing' },
            { e: '🏊', k: 'swimming' },
            { e: '🤽', k: 'water polo' },
            { e: '🚣', k: 'rowing' },
            { e: '🧗', k: 'climbing' },
            { e: '🚵', k: 'mountain biking' },
            { e: '🚴', k: 'biking' },
            { e: '🏆', k: 'trophy winner' },
            { e: '🥇', k: 'gold medal first' },
            { e: '🥈', k: 'silver medal' },
            { e: '🥉', k: 'bronze medal' },
            { e: '🏅', k: 'sports medal' },
            { e: '🎖', k: 'military medal' },
            { e: '🏵', k: 'rosette' },
            { e: '🎗', k: 'reminder ribbon' },
            { e: '🎫', k: 'ticket' },
            { e: '🎟', k: 'admission tickets' },
            { e: '🎪', k: 'circus' },
            { e: '🤹', k: 'juggling' },
            { e: '🎭', k: 'performing arts theater' },
            { e: '🩰', k: 'ballet' },
            { e: '🎨', k: 'art palette' },
            { e: '🎬', k: 'clapper movie' },
            { e: '🎤', k: 'microphone' },
            { e: '🎧', k: 'headphones' },
            { e: '🎼', k: 'musical score' },
            { e: '🎹', k: 'piano keyboard' },
            { e: '🥁', k: 'drum' },
            { e: '🪘', k: 'long drum' },
            { e: '🎷', k: 'saxophone' },
            { e: '🎺', k: 'trumpet' },
            { e: '🎸', k: 'guitar' },
            { e: '🪕', k: 'banjo' },
            { e: '🎻', k: 'violin' },
            { e: '🎲', k: 'dice game' },
            { e: '♟', k: 'chess' },
            { e: '🎯', k: 'dart target' },
            { e: '🎳', k: 'bowling' },
            { e: '🎮', k: 'video game' },
            { e: '🎰', k: 'slot machine' },
            { e: '🧩', k: 'puzzle' },
        ],
    },
    {
        id: 'travel',
        title: 'Travel & Places',
        emojis: [
            { e: '🚗', k: 'car' },
            { e: '🚕', k: 'taxi' },
            { e: '🚙', k: 'suv' },
            { e: '🚌', k: 'bus' },
            { e: '🚎', k: 'trolleybus' },
            { e: '🏎', k: 'race car' },
            { e: '🚓', k: 'police car' },
            { e: '🚑', k: 'ambulance' },
            { e: '🚒', k: 'fire engine' },
            { e: '🚐', k: 'minibus' },
            { e: '🛻', k: 'pickup truck' },
            { e: '🚚', k: 'delivery truck' },
            { e: '🚛', k: 'articulated lorry' },
            { e: '🚜', k: 'tractor' },
            { e: '🦯', k: 'white cane' },
            { e: '🦽', k: 'manual wheelchair' },
            { e: '🦼', k: 'motorized wheelchair' },
            { e: '🛴', k: 'scooter' },
            { e: '🚲', k: 'bicycle bike' },
            { e: '🛵', k: 'motor scooter' },
            { e: '🏍', k: 'motorcycle' },
            { e: '🛺', k: 'auto rickshaw' },
            { e: '🚨', k: 'police light' },
            { e: '🚔', k: 'oncoming police' },
            { e: '🚍', k: 'oncoming bus' },
            { e: '🚘', k: 'oncoming car' },
            { e: '🚖', k: 'oncoming taxi' },
            { e: '🚡', k: 'aerial tramway' },
            { e: '🚠', k: 'mountain cableway' },
            { e: '🚟', k: 'suspension railway' },
            { e: '🚃', k: 'railway car' },
            { e: '🚋', k: 'tram car' },
            { e: '🚞', k: 'mountain railway' },
            { e: '🚝', k: 'monorail' },
            { e: '🚄', k: 'bullet train' },
            { e: '🚅', k: 'bullet train' },
            { e: '🚈', k: 'light rail' },
            { e: '🚂', k: 'locomotive train' },
            { e: '🚆', k: 'train' },
            { e: '🚇', k: 'metro subway' },
            { e: '🚊', k: 'tram' },
            { e: '🚉', k: 'station' },
            { e: '✈️', k: 'airplane plane flight' },
            { e: '🛫', k: 'flight departure' },
            { e: '🛬', k: 'flight arrival' },
            { e: '🛩', k: 'small airplane' },
            { e: '💺', k: 'seat' },
            { e: '🛰', k: 'satellite' },
            { e: '🚀', k: 'rocket' },
            { e: '🛸', k: 'flying saucer ufo' },
            { e: '🚁', k: 'helicopter' },
            { e: '🛶', k: 'canoe' },
            { e: '⛵', k: 'sailboat' },
            { e: '🚤', k: 'speedboat' },
            { e: '🛥', k: 'motor boat' },
            { e: '🛳', k: 'passenger ship' },
            { e: '⛴', k: 'ferry' },
            { e: '🚢', k: 'ship' },
            { e: '⚓', k: 'anchor' },
            { e: '⛽', k: 'fuel pump' },
            { e: '🚧', k: 'construction' },
            { e: '🚦', k: 'traffic light' },
            { e: '🚥', k: 'horizontal traffic light' },
            { e: '🚏', k: 'bus stop' },
            { e: '🗺', k: 'world map' },
            { e: '🗿', k: 'moai' },
            { e: '🗽', k: 'statue liberty' },
            { e: '🗼', k: 'tokyo tower' },
            { e: '🏰', k: 'castle' },
            { e: '🏯', k: 'japanese castle' },
            { e: '🏟', k: 'stadium' },
            { e: '🎡', k: 'ferris wheel' },
            { e: '🎢', k: 'roller coaster' },
            { e: '🎠', k: 'carousel horse' },
            { e: '⛲', k: 'fountain' },
            { e: '⛱', k: 'umbrella beach' },
            { e: '🏖', k: 'beach umbrella' },
            { e: '🏝', k: 'desert island' },
            { e: '🏜', k: 'desert' },
            { e: '🌋', k: 'volcano' },
            { e: '⛰', k: 'mountain' },
            { e: '🏔', k: 'snow mountain' },
            { e: '🗻', k: 'mount fuji' },
            { e: '🏕', k: 'camping' },
            { e: '⛺', k: 'tent' },
            { e: '🏠', k: 'house home' },
            { e: '🏡', k: 'house garden' },
            { e: '🏘', k: 'houses' },
            { e: '🏚', k: 'derelict house' },
            { e: '🏗', k: 'construction building' },
            { e: '🏭', k: 'factory' },
            { e: '🏢', k: 'office building' },
            { e: '🏬', k: 'department store' },
            { e: '🏣', k: 'japanese post office' },
            { e: '🏤', k: 'post office' },
            { e: '🏥', k: 'hospital' },
            { e: '🏦', k: 'bank' },
            { e: '🏨', k: 'hotel' },
            { e: '🏪', k: 'convenience store' },
            { e: '🏫', k: 'school' },
            { e: '🏩', k: 'love hotel' },
            { e: '💒', k: 'wedding' },
            { e: '🏛', k: 'classical building' },
            { e: '⛪', k: 'church' },
            { e: '🕌', k: 'mosque' },
            { e: '🕍', k: 'synagogue' },
            { e: '🛕', k: 'hindu temple' },
            { e: '🕋', k: 'kaaba' },
            { e: '⛩', k: 'shinto shrine' },
            { e: '🛤', k: 'railway track' },
            { e: '🛣', k: 'motorway' },
            { e: '🗾', k: 'japan map' },
            { e: '🎑', k: 'moon viewing' },
            { e: '🏞', k: 'national park' },
            { e: '🌅', k: 'sunrise' },
            { e: '🌄', k: 'sunrise mountains' },
            { e: '🌠', k: 'shooting star' },
            { e: '🎇', k: 'sparkler' },
            { e: '🎆', k: 'fireworks' },
            { e: '🌇', k: 'cityscape dusk' },
            { e: '🌆', k: 'cityscape evening' },
            { e: '🏙', k: 'cityscape' },
            { e: '🌃', k: 'night stars' },
            { e: '🌌', k: 'milky way' },
            { e: '🌉', k: 'bridge night' },
            { e: '🌁', k: 'foggy' },
        ],
    },
    {
        id: 'objects',
        title: 'Objects',
        emojis: [
            { e: '⌚', k: 'watch' },
            { e: '📱', k: 'phone mobile' },
            { e: '📲', k: 'phone arrow' },
            { e: '💻', k: 'laptop computer' },
            { e: '⌨️', k: 'keyboard' },
            { e: '🖥', k: 'desktop computer' },
            { e: '🖨', k: 'printer' },
            { e: '🖱', k: 'computer mouse' },
            { e: '🖲', k: 'trackball' },
            { e: '🕹', k: 'joystick' },
            { e: '🗜', k: 'clamp' },
            { e: '💽', k: 'computer disk' },
            { e: '💾', k: 'floppy disk' },
            { e: '💿', k: 'cd' },
            { e: '📀', k: 'dvd' },
            { e: '📼', k: 'vhs' },
            { e: '📷', k: 'camera' },
            { e: '📸', k: 'camera flash' },
            { e: '📹', k: 'video camera' },
            { e: '🎥', k: 'movie camera' },
            { e: '📽', k: 'film projector' },
            { e: '🎞', k: 'film frames' },
            { e: '📞', k: 'telephone receiver' },
            { e: '☎️', k: 'telephone' },
            { e: '📟', k: 'pager' },
            { e: '📠', k: 'fax' },
            { e: '📺', k: 'tv television' },
            { e: '📻', k: 'radio' },
            { e: '🎙', k: 'studio microphone' },
            { e: '🎚', k: 'level slider' },
            { e: '🎛', k: 'control knobs' },
            { e: '🧭', k: 'compass' },
            { e: '⏱', k: 'stopwatch' },
            { e: '⏲', k: 'timer clock' },
            { e: '⏰', k: 'alarm clock' },
            { e: '🕰', k: 'mantelpiece clock' },
            { e: '⌛', k: 'hourglass' },
            { e: '⏳', k: 'hourglass flowing' },
            { e: '📡', k: 'satellite antenna' },
            { e: '🔋', k: 'battery' },
            { e: '🔌', k: 'electric plug' },
            { e: '💡', k: 'light bulb idea' },
            { e: '🔦', k: 'flashlight' },
            { e: '🕯', k: 'candle' },
            { e: '🪔', k: 'diya lamp' },
            { e: '🧯', k: 'fire extinguisher' },
            { e: '🛢', k: 'oil drum' },
            { e: '💸', k: 'money wings' },
            { e: '💵', k: 'dollar' },
            { e: '💴', k: 'yen' },
            { e: '💶', k: 'euro' },
            { e: '💷', k: 'pound' },
            { e: '🪙', k: 'coin' },
            { e: '💰', k: 'money bag' },
            { e: '💳', k: 'credit card' },
            { e: '💎', k: 'gem diamond' },
            { e: '⚖️', k: 'balance scale' },
            { e: '🪜', k: 'ladder' },
            { e: '🧰', k: 'toolbox' },
            { e: '🪛', k: 'screwdriver' },
            { e: '🔧', k: 'wrench' },
            { e: '🔨', k: 'hammer' },
            { e: '⚒', k: 'hammer pick' },
            { e: '🛠', k: 'hammer wrench' },
            { e: '⛏', k: 'pick' },
            { e: '🔩', k: 'nut bolt' },
            { e: '⚙️', k: 'gear' },
            { e: '🧱', k: 'brick' },
            { e: '⛓', k: 'chains' },
            { e: '🧲', k: 'magnet' },
            { e: '🔫', k: 'water pistol' },
            { e: '💣', k: 'bomb' },
            { e: '🧨', k: 'firecracker' },
            { e: '🪓', k: 'axe' },
            { e: '🔪', k: 'kitchen knife' },
            { e: '🗡', k: 'dagger' },
            { e: '⚔️', k: 'crossed swords' },
            { e: '🛡', k: 'shield' },
            { e: '🚬', k: 'cigarette' },
            { e: '⚰️', k: 'coffin' },
            { e: '🪦', k: 'headstone' },
            { e: '⚱️', k: 'funeral urn' },
            { e: '🏺', k: 'amphora' },
            { e: '🔮', k: 'crystal ball' },
            { e: '📿', k: 'prayer beads' },
            { e: '🧿', k: 'nazar amulet' },
            { e: '💈', k: 'barber pole' },
            { e: '⚗️', k: 'alembic' },
            { e: '🔭', k: 'telescope' },
            { e: '🔬', k: 'microscope' },
            { e: '🕳', k: 'hole' },
            { e: '🩹', k: 'adhesive bandage' },
            { e: '🩺', k: 'stethoscope' },
            { e: '💊', k: 'pill medicine' },
            { e: '💉', k: 'syringe' },
            { e: '🩸', k: 'drop of blood' },
            { e: '🧬', k: 'dna' },
            { e: '🦠', k: 'microbe virus' },
            { e: '🧫', k: 'petri dish' },
            { e: '🧪', k: 'test tube' },
            { e: '🌡', k: 'thermometer' },
            { e: '🧹', k: 'broom' },
            { e: '🧺', k: 'basket' },
            { e: '🧻', k: 'roll of paper' },
            { e: '🚽', k: 'toilet' },
            { e: '🚰', k: 'potable water' },
            { e: '🚿', k: 'shower' },
            { e: '🛁', k: 'bathtub' },
            { e: '🛀', k: 'bath' },
            { e: '🧼', k: 'soap' },
            { e: '🪥', k: 'toothbrush' },
            { e: '🪒', k: 'razor' },
            { e: '🧽', k: 'sponge' },
            { e: '🪣', k: 'bucket' },
            { e: '🧴', k: 'lotion bottle' },
            { e: '🛎', k: 'bellhop bell' },
            { e: '🔑', k: 'key' },
            { e: '🗝', k: 'old key' },
            { e: '🚪', k: 'door' },
            { e: '🪑', k: 'chair' },
            { e: '🛋', k: 'couch lamp' },
            { e: '🛏', k: 'bed' },
            { e: '🛌', k: 'person bed' },
            { e: '🧸', k: 'teddy bear' },
            { e: '🖼', k: 'framed picture' },
            { e: '🪞', k: 'mirror' },
            { e: '🪟', k: 'window' },
            { e: '🛍️', k: 'shopping bags' },
            { e: '🛒', k: 'shopping cart' },
            { e: '🎁', k: 'gift present' },
            { e: '🎈', k: 'balloon' },
            { e: '🎏', k: 'carp streamer' },
            { e: '🎀', k: 'ribbon' },
            { e: '🪄', k: 'magic wand' },
            { e: '🪅', k: 'pinata' },
            { e: '🎊', k: 'confetti ball' },
            { e: '🎉', k: 'party popper celebrate' },
            { e: '🎎', k: 'dolls' },
            { e: '🏮', k: 'red paper lantern' },
            { e: '🎐', k: 'wind chime' },
            { e: '🧧', k: 'red envelope' },
            { e: '✉️', k: 'envelope email' },
            { e: '📩', k: 'envelope arrow' },
            { e: '📨', k: 'incoming envelope' },
            { e: '📧', k: 'e-mail' },
            { e: '💌', k: 'love letter' },
            { e: '📥', k: 'inbox' },
            { e: '📤', k: 'outbox' },
            { e: '📦', k: 'package' },
            { e: '🏷', k: 'label' },
            { e: '🪧', k: 'placard' },
            { e: '📪', k: 'mailbox closed' },
            { e: '📫', k: 'mailbox closed raised' },
            { e: '📬', k: 'mailbox open' },
            { e: '📭', k: 'mailbox open lowered' },
            { e: '📮', k: 'postbox' },
            { e: '📯', k: 'postal horn' },
            { e: '📜', k: 'scroll' },
            { e: '📃', k: 'page curl' },
            { e: '📄', k: 'page facing up' },
            { e: '📑', k: 'bookmark tabs' },
            { e: '🧾', k: 'receipt' },
            { e: '📊', k: 'bar chart' },
            { e: '📈', k: 'chart increasing' },
            { e: '📉', k: 'chart decreasing' },
            { e: '🗒', k: 'spiral notepad' },
            { e: '🗓', k: 'spiral calendar' },
            { e: '📆', k: 'tear off calendar' },
            { e: '📅', k: 'calendar' },
            { e: '🗑', k: 'wastebasket trash' },
            { e: '📇', k: 'card index' },
            { e: '🗃', k: 'card file box' },
            { e: '🗳', k: 'ballot box' },
            { e: '🗄', k: 'file cabinet' },
            { e: '📋', k: 'clipboard' },
            { e: '📁', k: 'file folder' },
            { e: '📂', k: 'open file folder' },
            { e: '🗂', k: 'card index dividers' },
            { e: '🗞', k: 'rolled newspaper' },
            { e: '📰', k: 'newspaper' },
            { e: '📓', k: 'notebook' },
            { e: '📔', k: 'notebook decorative' },
            { e: '📒', k: 'ledger' },
            { e: '📕', k: 'closed book' },
            { e: '📗', k: 'green book' },
            { e: '📘', k: 'blue book' },
            { e: '📙', k: 'orange book' },
            { e: '📚', k: 'books' },
            { e: '📖', k: 'open book' },
            { e: '🔖', k: 'bookmark' },
            { e: '🧷', k: 'safety pin' },
            { e: '🔗', k: 'link' },
            { e: '📎', k: 'paperclip' },
            { e: '🖇', k: 'linked paperclips' },
            { e: '📐', k: 'triangular ruler' },
            { e: '📏', k: 'straight ruler' },
            { e: '🧮', k: 'abacus' },
            { e: '📌', k: 'pushpin' },
            { e: '📍', k: 'round pushpin' },
            { e: '✂️', k: 'scissors' },
            { e: '🖊', k: 'pen' },
            { e: '🖋', k: 'fountain pen' },
            { e: '✒️', k: 'black nib' },
            { e: '🖌', k: 'paintbrush' },
            { e: '🖍', k: 'crayon' },
            { e: '📝', k: 'memo note' },
            { e: '✏️', k: 'pencil' },
            { e: '🔍', k: 'magnifying glass left search' },
            { e: '🔎', k: 'magnifying glass right search' },
            { e: '🔏', k: 'locked pen' },
            { e: '🔐', k: 'locked key' },
            { e: '🔒', k: 'locked' },
            { e: '🔓', k: 'unlocked' },
        ],
    },
    {
        id: 'symbols',
        title: 'Symbols',
        emojis: [
            { e: '❤️', k: 'red heart love' },
            { e: '🧡', k: 'orange heart' },
            { e: '💛', k: 'yellow heart' },
            { e: '💚', k: 'green heart' },
            { e: '💙', k: 'blue heart' },
            { e: '💜', k: 'purple heart' },
            { e: '🖤', k: 'black heart' },
            { e: '🤍', k: 'white heart' },
            { e: '🤎', k: 'brown heart' },
            { e: '💔', k: 'broken heart' },
            { e: '❣️', k: 'heart exclamation' },
            { e: '💕', k: 'two hearts' },
            { e: '💞', k: 'revolving hearts' },
            { e: '💓', k: 'beating heart' },
            { e: '💗', k: 'growing heart' },
            { e: '💖', k: 'sparkling heart' },
            { e: '💘', k: 'heart arrow' },
            { e: '💝', k: 'heart ribbon' },
            { e: '💟', k: 'heart decoration' },
            { e: '☮️', k: 'peace' },
            { e: '✝️', k: 'latin cross' },
            { e: '☪️', k: 'star crescent' },
            { e: '🕉', k: 'om' },
            { e: '☸️', k: 'wheel of dharma' },
            { e: '✡️', k: 'star of david' },
            { e: '🔯', k: 'dotted six pointed star' },
            { e: '🕎', k: 'menorah' },
            { e: '☯️', k: 'yin yang' },
            { e: '☦️', k: 'orthodox cross' },
            { e: '🛐', k: 'place of worship' },
            { e: '⛎', k: 'ophiuchus' },
            { e: '♈', k: 'aries' },
            { e: '♉', k: 'taurus' },
            { e: '♊', k: 'gemini' },
            { e: '♋', k: 'cancer' },
            { e: '♌', k: 'leo' },
            { e: '♍', k: 'virgo' },
            { e: '♎', k: 'libra' },
            { e: '♏', k: 'scorpio' },
            { e: '♐', k: 'sagittarius' },
            { e: '♑', k: 'capricorn' },
            { e: '♒', k: 'aquarius' },
            { e: '♓', k: 'pisces' },
            { e: '🆔', k: 'id' },
            { e: '⚛️', k: 'atom' },
            { e: '🉑', k: 'accept' },
            { e: '☢️', k: 'radioactive' },
            { e: '☣️', k: 'biohazard' },
            { e: '📴', k: 'mobile off' },
            { e: '📳', k: 'vibration' },
            { e: '🈶', k: 'not free of charge' },
            { e: '🈚', k: 'free of charge' },
            { e: '🈸', k: 'application' },
            { e: '🈺', k: 'open for business' },
            { e: '🈷️', k: 'monthly amount' },
            { e: '✴️', k: 'eight pointed star' },
            { e: '🆚', k: 'vs' },
            { e: '💮', k: 'white flower' },
            { e: '🉐', k: 'bargain' },
            { e: '㊙️', k: 'secret' },
            { e: '㊗️', k: 'congratulations' },
            { e: '🈴', k: 'passing grade' },
            { e: '🈵', k: 'no vacancy' },
            { e: '🈹', k: 'discount' },
            { e: '🈲', k: 'prohibited' },
            { e: '🅰️', k: 'a button' },
            { e: '🅱️', k: 'b button' },
            { e: '🆎', k: 'ab button' },
            { e: '🆑', k: 'cl' },
            { e: '🅾️', k: 'o button' },
            { e: '🆘', k: 'sos help' },
            { e: '❌', k: 'cross mark x no' },
            { e: '⭕', k: 'hollow red circle' },
            { e: '🛑', k: 'stop sign' },
            { e: '⛔', k: 'no entry' },
            { e: '📛', k: 'name badge' },
            { e: '🚫', k: 'prohibited' },
            { e: '💯', k: 'hundred points 100' },
            { e: '💢', k: 'anger' },
            { e: '♨️', k: 'hotsprings' },
            { e: '🚷', k: 'no pedestrians' },
            { e: '🚯', k: 'no littering' },
            { e: '🚳', k: 'no bicycles' },
            { e: '🚱', k: 'non potable water' },
            { e: '🔞', k: 'no one under eighteen' },
            { e: '📵', k: 'no mobile phones' },
            { e: '🚭', k: 'no smoking' },
            { e: '❗', k: 'exclamation' },
            { e: '❕', k: 'white exclamation' },
            { e: '❓', k: 'question' },
            { e: '❔', k: 'white question' },
            { e: '‼️', k: 'double exclamation' },
            { e: '⁉️', k: 'exclamation question' },
            { e: '🔅', k: 'dim button' },
            { e: '🔆', k: 'bright button' },
            { e: '〽️', k: 'part alternation' },
            { e: '⚠️', k: 'warning' },
            { e: '🚸', k: 'children crossing' },
            { e: '🔱', k: 'trident' },
            { e: '⚜️', k: 'fleur de lis' },
            { e: '🔰', k: 'japanese beginner' },
            { e: '♻️', k: 'recycling' },
            { e: '✅', k: 'check mark button yes' },
            { e: '🈯', k: 'reserved' },
            { e: '💹', k: 'chart yen' },
            { e: '❇️', k: 'sparkle' },
            { e: '✳️', k: 'eight spoked asterisk' },
            { e: '❎', k: 'cross mark button' },
            { e: '🌐', k: 'globe meridians' },
            { e: '💠', k: 'diamond with a dot' },
            { e: 'Ⓜ️', k: 'circled m' },
            { e: '🌀', k: 'cyclone' },
            { e: '💤', k: 'zzz sleep' },
            { e: '🏧', k: 'atm' },
            { e: '🚾', k: 'water closet wc' },
            { e: '♿', k: 'wheelchair' },
            { e: '🅿️', k: 'parking' },
            { e: '🛗', k: 'elevator' },
            { e: '🈳', k: 'vacancy' },
            { e: '🈂️', k: 'service charge' },
            { e: '🛂', k: 'passport control' },
            { e: '🛃', k: 'customs' },
            { e: '🛄', k: 'baggage claim' },
            { e: '🛅', k: 'left luggage' },
            { e: '🚹', k: 'mens room' },
            { e: '🚺', k: 'womens room' },
            { e: '🚼', k: 'baby symbol' },
            { e: '⚧', k: 'transgender' },
            { e: '🚻', k: 'restroom' },
            { e: '🚮', k: 'litter in bin' },
            { e: '🎦', k: 'cinema' },
            { e: '📶', k: 'antenna bars signal' },
            { e: '🈁', k: 'here' },
            { e: '🔣', k: 'symbols' },
            { e: 'ℹ️', k: 'information' },
            { e: '🔤', k: 'input latin letters' },
            { e: '🔡', k: 'input latin lowercase' },
            { e: '🔠', k: 'input latin uppercase' },
            { e: '🔢', k: 'input numbers' },
            { e: '🔟', k: 'keycap ten' },
            { e: '#️⃣', k: 'keycap hash' },
            { e: '*️⃣', k: 'keycap star' },
            { e: '0️⃣', k: 'keycap zero' },
            { e: '1️⃣', k: 'keycap one' },
            { e: '2️⃣', k: 'keycap two' },
            { e: '3️⃣', k: 'keycap three' },
            { e: '4️⃣', k: 'keycap four' },
            { e: '5️⃣', k: 'keycap five' },
            { e: '6️⃣', k: 'keycap six' },
            { e: '7️⃣', k: 'keycap seven' },
            { e: '8️⃣', k: 'keycap eight' },
            { e: '9️⃣', k: 'keycap nine' },
            { e: '🔴', k: 'red circle' },
            { e: '🟠', k: 'orange circle' },
            { e: '🟡', k: 'yellow circle' },
            { e: '🟢', k: 'green circle' },
            { e: '🔵', k: 'blue circle' },
            { e: '🟣', k: 'purple circle' },
            { e: '⚫', k: 'black circle' },
            { e: '⚪', k: 'white circle' },
            { e: '🟤', k: 'brown circle' },
            { e: '🔺', k: 'red triangle up' },
            { e: '🔻', k: 'red triangle down' },
            { e: '🔸', k: 'orange diamond' },
            { e: '🔹', k: 'blue diamond' },
            { e: '🔶', k: 'large orange diamond' },
            { e: '🔷', k: 'large blue diamond' },
            { e: '🔳', k: 'white square button' },
            { e: '🔲', k: 'black square button' },
            { e: '▪️', k: 'black small square' },
            { e: '▫️', k: 'white small square' },
            { e: '◾', k: 'black medium small square' },
            { e: '◽', k: 'white medium small square' },
            { e: '◼️', k: 'black medium square' },
            { e: '◻️', k: 'white medium square' },
            { e: '🟥', k: 'red square' },
            { e: '🟧', k: 'orange square' },
            { e: '🟨', k: 'yellow square' },
            { e: '🟩', k: 'green square' },
            { e: '🟦', k: 'blue square' },
            { e: '🟪', k: 'purple square' },
            { e: '⬛', k: 'black large square' },
            { e: '⬜', k: 'white large square' },
            { e: '🟫', k: 'brown square' },
            { e: '🔈', k: 'speaker low' },
            { e: '🔇', k: 'muted speaker' },
            { e: '🔉', k: 'speaker medium' },
            { e: '🔊', k: 'speaker high' },
            { e: '🔔', k: 'bell' },
            { e: '🔕', k: 'bell slash' },
            { e: '📣', k: 'megaphone' },
            { e: '📢', k: 'loudspeaker' },
            { e: '💬', k: 'speech balloon' },
            { e: '💭', k: 'thought balloon' },
            { e: '🗯', k: 'right anger bubble' },
            { e: '♠️', k: 'spade suit' },
            { e: '♣️', k: 'club suit' },
            { e: '♥️', k: 'heart suit' },
            { e: '♦️', k: 'diamond suit' },
            { e: '🃏', k: 'joker' },
            { e: '🎴', k: 'flower playing cards' },
            { e: '🀄', k: 'mahjong' },
            { e: '🕐', k: 'one oclock' },
            { e: '🕑', k: 'two oclock' },
            { e: '🕒', k: 'three oclock' },
            { e: '🕓', k: 'four oclock' },
            { e: '🕔', k: 'five oclock' },
            { e: '🕕', k: 'six oclock' },
            { e: '🕖', k: 'seven oclock' },
            { e: '🕗', k: 'eight oclock' },
            { e: '🕘', k: 'nine oclock' },
            { e: '🕙', k: 'ten oclock' },
            { e: '🕚', k: 'eleven oclock' },
            { e: '🕛', k: 'twelve oclock' },
        ],
    },
];

function loadRecentEmojis() {
    try {
        const raw = localStorage.getItem(RECENT_EMOJI_KEY);
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.filter((e) => typeof e === 'string').slice(0, MAX_RECENT_EMOJIS) : [];
    } catch {
        return [];
    }
}

function saveRecentEmoji(emoji) {
    const next = [emoji, ...loadRecentEmojis().filter((e) => e !== emoji)].slice(0, MAX_RECENT_EMOJIS);
    try {
        localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
    } catch {
        /* ignore */
    }
    return next;
}

function formatBubbleTime(value) {
    if (!value) return '';
    try {
        const d = typeof value === 'string' ? parseISO(value) : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        return format(d, 'h:mm a');
    } catch {
        return '';
    }
}

function formatReadTime(value) {
    if (!value) return '';
    try {
        const d = typeof value === 'string' ? parseISO(value) : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        if (isToday(d)) return `Today at ${format(d, 'h:mm a')}`;
        if (isYesterday(d)) return `Yesterday at ${format(d, 'h:mm a')}`;
        return format(d, 'M/d/yyyy \'at\' h:mm a');
    } catch {
        return '';
    }
}

function dayLabel(value) {
    try {
        const d = typeof value === 'string' ? parseISO(value) : new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        if (isToday(d)) return 'Today';
        if (isYesterday(d)) return 'Yesterday';
        return format(d, 'M/d/yyyy');
    } catch {
        return '';
    }
}

/** WhatsApp Web–style double/single ticks (filled path, larger). */
function TickSingle() {
    return (
        <svg
            className="cb-tick-svg cb-tick-svg--single"
            viewBox="0 0 12 11"
            width="16"
            height="15"
            aria-hidden="true"
            focusable="false"
        >
            <path
                fill="currentColor"
                d="M11.157.538a.527.527 0 0 1 .15.71L5.21 9.691a.717.717 0 0 1-1.106.02L.494 5.744a.524.524 0 0 1 .034-.738.53.53 0 0 1 .745.037l2.78 3.278L10.447.69a.53.53 0 0 1 .71-.152z"
            />
        </svg>
    );
}

function TickDouble() {
    return (
        <svg
            className="cb-tick-svg cb-tick-svg--double"
            viewBox="0 0 16 15"
            width="20"
            height="15"
            aria-hidden="true"
            focusable="false"
        >
            <path
                fill="currentColor"
                d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266a.48.48 0 0 0 .634-.018l6.813-8.048a.366.366 0 0 0-.063-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .005.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"
            />
        </svg>
    );
}

function ReceiptTicks({ status }) {
    if (status === 'failed') {
        return (
            <span className="cb-ticks cb-ticks--failed" aria-label="Failed to send" title="Failed to send">
                !
            </span>
        );
    }
    if (status === 'sending') {
        return (
            <span className="cb-ticks cb-ticks--sending" aria-label="Sending">
                …
            </span>
        );
    }
    if (status === 'read_all') {
        return (
            <span className="cb-ticks cb-ticks--read" aria-label="Read by all">
                <TickDouble />
            </span>
        );
    }
    if (status === 'delivered') {
        return (
            <span className="cb-ticks cb-ticks--delivered" aria-label="Delivered">
                <TickDouble />
            </span>
        );
    }
    return (
        <span className="cb-ticks cb-ticks--sent" aria-label="Sent">
            <TickSingle />
        </span>
    );
}

const ChatThread = ({
    selectedId,
    detail,
    selectedGroup,
    messages,
    sendMessage,
    groups,
    email,
    onMessagesUpdate,
    notifyUnreadChanged,
    loadGroups,
    loadDetail,
}) => {
    // Local draft so keystrokes don't re-render the whole ChatBox layout
    const [draft, setDraft] = useState('');
    const [replyTo, setReplyTo] = useState(null);
    const [menu, setMenu] = useState(null);
    const [emojiBar, setEmojiBar] = useState(null);
    const [readByModal, setReadByModal] = useState(null);
    const [forwardSelectMode, setForwardSelectMode] = useState(false);
    const [selectedForwardIds, setSelectedForwardIds] = useState([]);
    const [forwardTargetOpen, setForwardTargetOpen] = useState(false);
    const [forwardSending, setForwardSending] = useState(false);
    const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
    const [emojiSearch, setEmojiSearch] = useState('');
    const [recentEmojis, setRecentEmojis] = useState(() => loadRecentEmojis());
    const [pendingImage, setPendingImage] = useState(null); // { file, previewUrl }
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);
    const [chatSearchOpen, setChatSearchOpen] = useState(false);
    const [chatSearchQuery, setChatSearchQuery] = useState('');
    const [chatSearchMatchIndex, setChatSearchMatchIndex] = useState(0);
    const messagesEndRef = useRef(null);
    const messagesScrollRef = useRef(null);
    const draftInputRef = useRef(null);
    const fileInputRef = useRef(null);
    const avatarInputRef = useRef(null);
    const chatSearchInputRef = useRef(null);

    useEffect(() => {
        if (chatSearchOpen) return;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, selectedId, replyTo, chatSearchOpen]);

    useEffect(() => {
        setDraft('');
        setComposerEmojiOpen(false);
        setEmojiSearch('');
        setForwardSelectMode(false);
        setSelectedForwardIds([]);
        setForwardTargetOpen(false);
        setMenu(null);
        setAvatarLightboxOpen(false);
        setChatSearchOpen(false);
        setChatSearchQuery('');
        setChatSearchMatchIndex(0);
        setPendingImage((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
    }, [selectedId]);

    useEffect(() => {
        if (!chatSearchOpen) return undefined;
        const t = requestAnimationFrame(() => chatSearchInputRef.current?.focus());
        return () => cancelAnimationFrame(t);
    }, [chatSearchOpen]);

    useEffect(() => {
        if (!avatarLightboxOpen && !chatSearchOpen) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (avatarLightboxOpen) setAvatarLightboxOpen(false);
                if (chatSearchOpen) {
                    setChatSearchOpen(false);
                    setChatSearchQuery('');
                    setChatSearchMatchIndex(0);
                }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [avatarLightboxOpen, chatSearchOpen]);

    useEffect(() => {
        return () => {
            if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
        };
    }, [pendingImage]);

    useEffect(() => {
        const close = () => {
            setMenu(null);
            setEmojiBar(null);
            setComposerEmojiOpen(false);
            setEmojiSearch('');
        };
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, []);

    const filteredEmojiCategories = useMemo(() => {
        const q = emojiSearch.trim().toLowerCase();
        if (!q) return EMOJI_CATEGORIES;
        return EMOJI_CATEGORIES.map((cat) => ({
            ...cat,
            emojis: cat.emojis.filter(
                (item) => item.e.includes(q) || item.k.toLowerCase().includes(q)
            ),
        })).filter((cat) => cat.emojis.length > 0);
    }, [emojiSearch]);

    const insertComposerEmoji = (emoji) => {
        const input = draftInputRef.current;
        const current = draft || '';
        if (input && typeof input.selectionStart === 'number') {
            const start = input.selectionStart;
            const end = input.selectionEnd ?? start;
            const next = current.slice(0, start) + emoji + current.slice(end);
            setDraft(next);
            requestAnimationFrame(() => {
                input.focus();
                const pos = start + emoji.length;
                input.setSelectionRange(pos, pos);
            });
        } else {
            setDraft(current + emoji);
        }
        setRecentEmojis(saveRecentEmoji(emoji));
    };

    const messageBlocks = useMemo(() => {
        const blocks = [];
        let lastDay = null;
        (messages || []).forEach((m) => {
            const label = dayLabel(m.CreatedAt);
            if (label && label !== lastDay) {
                blocks.push({ type: 'day', label, key: `day-${label}-${m.CreatedAt}` });
                lastDay = label;
            }
            blocks.push({ type: 'msg', msg: m, key: `m-${m.ID}` });
        });
        return blocks;
    }, [messages]);

    const chatSearchMatches = useMemo(() => {
        const q = chatSearchQuery.trim().toLowerCase();
        if (!q) return [];
        return (messages || []).filter((m) => {
            if (m.IsSystem || m.IsDeleted) return false;
            const body = String(m.NoteContent || '').toLowerCase();
            const author = String(m.UserName || '').toLowerCase();
            const file = String(m.AttachmentName || '').toLowerCase();
            return body.includes(q) || author.includes(q) || file.includes(q);
        });
    }, [messages, chatSearchQuery]);

    useEffect(() => {
        setChatSearchMatchIndex(0);
    }, [chatSearchQuery, selectedId]);

    useEffect(() => {
        if (!chatSearchOpen || !chatSearchMatches.length) return;
        const safeIdx =
            ((chatSearchMatchIndex % chatSearchMatches.length) + chatSearchMatches.length) %
            chatSearchMatches.length;
        const id = chatSearchMatches[safeIdx]?.ID;
        if (!id) return;
        const el = document.getElementById(`cb-msg-${id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [chatSearchOpen, chatSearchMatches, chatSearchMatchIndex]);

    const goSearchMatch = (delta) => {
        if (!chatSearchMatches.length) return;
        setChatSearchMatchIndex((i) => {
            const next = i + delta;
            if (next < 0) return chatSearchMatches.length - 1;
            if (next >= chatSearchMatches.length) return 0;
            return next;
        });
    };

    const closeChatSearch = () => {
        setChatSearchOpen(false);
        setChatSearchQuery('');
        setChatSearchMatchIndex(0);
    };

    const activeSearchMatchId = chatSearchMatches.length
        ? chatSearchMatches[
              ((chatSearchMatchIndex % chatSearchMatches.length) + chatSearchMatches.length) %
                  chatSearchMatches.length
          ]?.ID
        : null;
    const searchHighlight = chatSearchQuery.trim();


    const openMenu = (e, msg) => {
        e.stopPropagation();
        if (forwardSelectMode) return;
        const bubble =
            e.currentTarget?.closest?.('.cb-bubble') ||
            e.currentTarget ||
            null;
        const rect = bubble?.getBoundingClientRect?.();
        const pad = 12;
        const panelW = 150;
        const panelH = 210;
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 3;
        let placeBelow = false;
        if (rect) {
            x = rect.left + rect.width / 2;
            // Prefer above the message
            y = rect.top - 8;
            if (y - panelH < pad) {
                // Not enough room above — place below message
                y = rect.bottom + 8;
                placeBelow = true;
            }
        }
        x = Math.max(pad + panelW / 2, Math.min(x, window.innerWidth - pad - panelW / 2));
        if (!placeBelow) {
            y = Math.max(pad + panelH, y);
        } else {
            y = Math.min(y, window.innerHeight - pad);
        }
        setMenu({
            msg,
            isOut: !!msg.IsOwn,
            x,
            y,
            placeBelow,
            bubble: rect
                ? {
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                  }
                : null,
        });
        setEmojiBar(null);
        setComposerEmojiOpen(false);
    };

    const handleCopyMessage = async (msg) => {
        const text = msg?.IsDeleted ? '' : String(msg?.NoteContent || '');
        setMenu(null);
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            } catch (err) {
                console.warn('[ChatBox] copy', err);
            }
        }
    };

    const canDeleteMessage = (msg) =>
        !!msg?.IsOwn && !msg?.IsDeleted && msg?.ReceiptStatus !== 'read_all';

    const handleReply = (msg) => {
        setReplyTo(msg);
        setMenu(null);
    };

    const startForwardSelect = (msg) => {
        setMenu(null);
        setForwardSelectMode(true);
        setSelectedForwardIds(msg?.ID ? [msg.ID] : []);
    };

    const toggleForwardSelect = (msg) => {
        if (!msg?.ID || msg.IsSystem || msg.IsDeleted) return;
        setSelectedForwardIds((prev) =>
            prev.includes(msg.ID) ? prev.filter((id) => id !== msg.ID) : [...prev, msg.ID]
        );
    };

    const cancelForwardSelect = () => {
        setForwardSelectMode(false);
        setSelectedForwardIds([]);
        setForwardTargetOpen(false);
    };

    const handleDelete = async (msg) => {
        if (!canDeleteMessage(msg)) {
            alert('Cannot delete — this message has been read by everyone');
            setMenu(null);
            return;
        }
        setMenu(null);
        if (!window.confirm('Delete this message?')) return;
        try {
            const res = await fetch(
                `/api/chatbox/groups/${encodeURIComponent(selectedId)}/messages/${msg.ID}?email=${encodeURIComponent(email)}`,
                { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Could not delete');
                return;
            }
            onMessagesUpdate(await res.json());
        } catch (err) {
            console.warn('[ChatBox] delete', err);
        }
    };

    const handleReact = async (msg, emoji) => {
        setMenu(null);
        setEmojiBar(null);
        try {
            const res = await fetch(
                `/api/chatbox/groups/${encodeURIComponent(selectedId)}/messages/${msg.ID}/react`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, emoji }),
                }
            );
            if (res.ok) onMessagesUpdate(await res.json());
        } catch (err) {
            console.warn('[ChatBox] react', err);
        }
    };

    const handleReadBy = async (msg) => {
        setMenu(null);
        try {
            const res = await fetch(
                `/api/chatbox/groups/${encodeURIComponent(selectedId)}/messages/${msg.ID}/read-by?email=${encodeURIComponent(email)}`
            );
            if (!res.ok) return;
            const data = await res.json();
            setReadByModal({
                msg,
                readBy: data.readBy || [],
                deliveredTo: data.deliveredTo || [],
                remaining: data.remaining || [],
            });
        } catch (err) {
            console.warn('[ChatBox] read-by', err);
        }
    };

    const handleForwardSend = async (targetRequestNo) => {
        if (!targetRequestNo || !selectedForwardIds.length || forwardSending) return;
        const ordered = (messages || []).filter((m) => selectedForwardIds.includes(m.ID));
        if (!ordered.length) return;
        setForwardSending(true);
        try {
            for (const msg of ordered) {
                const text = msg.IsDeleted
                    ? 'Forwarded message'
                    : String(msg.NoteContent || '');
                const res = await fetch(
                    `/api/chatbox/groups/${encodeURIComponent(targetRequestNo)}/messages`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email,
                            content: text,
                            forwardFromNoteId: msg.ID,
                        }),
                    }
                );
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(err.error || 'Could not forward some messages');
                    break;
                }
            }
            cancelForwardSelect();
            await loadGroups?.();
            notifyUnreadChanged?.();
        } catch (err) {
            console.warn('[ChatBox] forward', err);
            alert('Could not forward messages');
        } finally {
            setForwardSending(false);
        }
    };

    const clearPendingImage = () => {
        setPendingImage((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return null;
        });
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const setImageFromFile = (file) => {
        if (!file || !String(file.type || '').startsWith('image/')) return;
        if (file.size > 8 * 1024 * 1024) {
            alert('Image must be 8 MB or smaller');
            return;
        }
        setPendingImage((prev) => {
            if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
            return { file, previewUrl: URL.createObjectURL(file) };
        });
    };

    const onPickImage = (e) => {
        const file = e.target.files?.[0];
        if (file) setImageFromFile(file);
    };

    const onPasteImage = (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            if (item.type && item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    const named = new File(
                        [file],
                        `screenshot-${Date.now()}.png`,
                        { type: file.type || 'image/png' }
                    );
                    setImageFromFile(named);
                }
                break;
            }
        }
    };

    const attachmentSrc = (msg) => {
        if (!msg?.AttachmentUrl) return null;
        if (String(msg.AttachmentUrl).startsWith('blob:')) return msg.AttachmentUrl;
        if (!email) return null;
        const sep = msg.AttachmentUrl.includes('?') ? '&' : '?';
        return `${msg.AttachmentUrl}${sep}email=${encodeURIComponent(email)}`;
    };

    const groupAvatarSrc = useMemo(() => {
        const url = detail?.GroupAvatarUrl || selectedGroup?.GroupAvatarUrl;
        if (!url || !email) return null;
        const sep = url.includes('?') ? '&' : '?';
        return `${url}${sep}email=${encodeURIComponent(email)}`;
    }, [detail?.GroupAvatarUrl, selectedGroup?.GroupAvatarUrl, email]);

    const groupTitle =
        detail?.ProjectName || selectedGroup?.ProjectName || selectedId || '?';

    const uploadGroupAvatar = async (file) => {
        if (!file || !selectedId || !email) return;
        if (!String(file.type || '').startsWith('image/')) {
            alert('Please choose an image file');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            alert('Image must be 8 MB or smaller');
            return;
        }
        setAvatarUploading(true);
        try {
            const fd = new FormData();
            fd.append('email', email);
            fd.append('avatar', file, file.name || 'group-dp.png');
            const res = await fetch(
                `/api/chatbox/groups/${encodeURIComponent(selectedId)}/avatar`,
                { method: 'POST', body: fd }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Could not update group photo');
                return;
            }
            await Promise.all([
                loadDetail?.(selectedId),
                loadGroups?.(),
                // refresh messages so system line appears
                fetch(
                    `/api/chatbox/groups/${encodeURIComponent(selectedId)}/messages?email=${encodeURIComponent(email)}`
                )
                    .then((r) => (r.ok ? r.json() : null))
                    .then((data) => {
                        if (Array.isArray(data)) onMessagesUpdate?.(data);
                    }),
            ]);
        } catch (err) {
            console.warn('[ChatBox] avatar upload', err);
            alert('Could not update group photo');
        } finally {
            setAvatarUploading(false);
            if (avatarInputRef.current) avatarInputRef.current.value = '';
        }
    };

    const removeGroupAvatar = async () => {
        if (!selectedId || !email || !groupAvatarSrc) return;
        if (!window.confirm('Remove group photo?')) return;
        setAvatarUploading(true);
        try {
            const res = await fetch(
                `/api/chatbox/groups/${encodeURIComponent(selectedId)}/avatar`,
                {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                }
            );
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Could not remove group photo');
                return;
            }
            await Promise.all([loadDetail?.(selectedId), loadGroups?.()]);
        } catch (err) {
            console.warn('[ChatBox] avatar remove', err);
        } finally {
            setAvatarUploading(false);
        }
    };

    const onSubmit = (e) => {
        e.preventDefault();
        setComposerEmojiOpen(false);
        setEmojiSearch('');
        const content = draft.trim();
        const img = pendingImage?.file || null;
        if (!content && !img) return;
        const replyId = replyTo?.ID || null;
        setDraft('');
        sendMessage(
            e,
            replyId,
            () => {
                setReplyTo(null);
                clearPendingImage();
            },
            img,
            content
        );
    };

    const forwardTargets = (groups || []).filter(
        (g) => String(g.RequestNo) !== String(selectedId)
    );

    return (
        <div className="cb-thread">
            <div className="cb-thread-header">
                {chatSearchOpen ? (
                    <div className="cb-chat-search">
                        <button
                            type="button"
                            className="cb-chat-search-close"
                            aria-label="Close search"
                            title="Close"
                            onClick={closeChatSearch}
                        >
                            <i className="bi bi-arrow-left" />
                        </button>
                        <input
                            ref={chatSearchInputRef}
                            type="search"
                            className="cb-chat-search-input"
                            placeholder="Search messages…"
                            value={chatSearchQuery}
                            onChange={(e) => setChatSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    goSearchMatch(e.shiftKey ? -1 : 1);
                                }
                            }}
                        />
                        <span className="cb-chat-search-count">
                            {searchHighlight
                                ? chatSearchMatches.length
                                    ? `${chatSearchMatchIndex % chatSearchMatches.length + 1} of ${chatSearchMatches.length}`
                                    : '0 results'
                                : ''}
                        </span>
                        <button
                            type="button"
                            className="cb-chat-search-nav"
                            aria-label="Previous match"
                            disabled={!chatSearchMatches.length}
                            onClick={() => goSearchMatch(-1)}
                        >
                            <i className="bi bi-chevron-up" />
                        </button>
                        <button
                            type="button"
                            className="cb-chat-search-nav"
                            aria-label="Next match"
                            disabled={!chatSearchMatches.length}
                            onClick={() => goSearchMatch(1)}
                        >
                            <i className="bi bi-chevron-down" />
                        </button>
                    </div>
                ) : (
                    <>
                <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="cb-composer-file"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadGroupAvatar(f);
                    }}
                    aria-hidden
                    tabIndex={-1}
                />
                <button
                    type="button"
                    className={`cb-avatar cb-avatar-btn${avatarUploading ? ' uploading' : ''}${
                        groupAvatarSrc ? ' has-photo' : ''
                    }`}
                    style={{ width: 40, height: 40, fontSize: '0.95rem' }}
                    title={groupAvatarSrc ? 'View group photo' : 'Add group photo'}
                    aria-label={groupAvatarSrc ? 'View group photo' : 'Add group photo'}
                    disabled={avatarUploading}
                    onClick={() => {
                        if (groupAvatarSrc) setAvatarLightboxOpen(true);
                        else avatarInputRef.current?.click();
                    }}
                >
                    {groupAvatarSrc ? (
                        <img src={groupAvatarSrc} alt="" className="cb-avatar-img" />
                    ) : (
                        String(groupTitle).charAt(0).toUpperCase()
                    )}
                </button>
                <div className="cb-thread-header-text">
                    <p className="cb-thread-title">
                        {detail?.ProjectName || selectedGroup?.ProjectName || selectedId}
                    </p>
                    <p className="cb-thread-sub">
                        {(detail?.members || []).length
                            ? `${(detail.members || []).length} members`
                            : 'Group chat'}
                        {' · '}
                        <button
                            type="button"
                            className="cb-avatar-change-link"
                            disabled={avatarUploading}
                            onClick={() => avatarInputRef.current?.click()}
                        >
                            {avatarUploading ? 'Updating…' : 'Change photo'}
                        </button>
                        {groupAvatarSrc ? (
                            <>
                                {' · '}
                                <button
                                    type="button"
                                    className="cb-avatar-change-link"
                                    disabled={avatarUploading}
                                    onClick={() => void removeGroupAvatar()}
                                >
                                    Remove
                                </button>
                            </>
                        ) : null}
                    </p>
                </div>
                <button
                    type="button"
                    className="cb-thread-search-btn"
                    aria-label="Search in chat"
                    title="Search in chat"
                    onClick={() => setChatSearchOpen(true)}
                >
                    <i className="bi bi-search" />
                </button>
                    </>
                )}
            </div>

            <div className="cb-messages" ref={messagesScrollRef}>
                {!messages.length ? (
                    <div className="cb-empty">No messages yet. Say hello to the group.</div>
                ) : (
                    messageBlocks.map((b) => {
                        if (b.type === 'day') {
                            return (
                                <div className="cb-day" key={b.key}>
                                    <span>{b.label}</span>
                                </div>
                            );
                        }
                        const m = b.msg;
                        if (m.IsSystem) {
                            return (
                                <div className="cb-system" key={b.key}>
                                    <span>{m.NoteContent}</span>
                                </div>
                            );
                        }
                        const isOut = m.IsOwn;
                        const deleted = m.IsDeleted;
                        const isSelected = selectedForwardIds.includes(m.ID);
                        const isSearchHit =
                            !!searchHighlight &&
                            chatSearchMatches.some((x) => x.ID === m.ID);
                        const isActiveSearchHit = activeSearchMatchId === m.ID;
                        return (
                            <div
                                key={b.key}
                                id={`cb-msg-${m.ID}`}
                                className={`cb-bubble-row ${isOut ? 'out' : 'in'}${
                                    forwardSelectMode ? ' selecting' : ''
                                }${isSelected ? ' selected' : ''}${
                                    isSearchHit ? ' cb-search-hit' : ''
                                }${isActiveSearchHit ? ' cb-search-hit-active' : ''}`}
                                onClick={() => {
                                    if (forwardSelectMode) toggleForwardSelect(m);
                                }}
                            >
                                {forwardSelectMode ? (
                                    <span
                                        className={`cb-select-check${isSelected ? ' on' : ''}`}
                                        aria-hidden="true"
                                    >
                                        <i className={`bi ${isSelected ? 'bi-check-circle-fill' : 'bi-circle'}`} />
                                    </span>
                                ) : null}
                                <div
                                    className={`cb-bubble ${isOut ? 'out' : 'in'}${deleted ? ' deleted' : ''}${
                                        isSelected ? ' selected' : ''
                                    }`}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        openMenu(e, m);
                                    }}
                                >
                                    {!isOut ? (
                                        <div className="cb-bubble-author">{m.UserName}</div>
                                    ) : null}
                                    {m.ReplyPreview ? (
                                        <div className="cb-reply-preview">
                                            <strong>{m.ReplyPreview.UserName}</strong>
                                            <span>
                                                <EmojiText text={m.ReplyPreview.Content} size={14} />
                                            </span>
                                        </div>
                                    ) : null}
                                    {m.ForwardedFromNoteID ? (
                                        <div className="cb-forward-label">
                                            <i className="bi bi-reply-fill" /> Forwarded
                                        </div>
                                    ) : null}
                                    {!deleted && m.HasAttachment && attachmentSrc(m) ? (
                                        <a
                                            className="cb-bubble-image-link"
                                            href={attachmentSrc(m)}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <img
                                                className="cb-bubble-image"
                                                src={attachmentSrc(m)}
                                                alt={m.AttachmentName || 'Image'}
                                                loading="lazy"
                                            />
                                        </a>
                                    ) : null}
                                    {(deleted || (m.NoteContent && String(m.NoteContent).trim())) ? (
                                        <div className={`cb-bubble-text${deleted ? ' italic' : ''}`}>
                                            {deleted ? (
                                                'This message was deleted'
                                            ) : (
                                                <EmojiText
                                                    text={m.NoteContent}
                                                    size={20}
                                                    highlight={
                                                        isSearchHit ? searchHighlight : ''
                                                    }
                                                />
                                            )}
                                        </div>
                                    ) : null}
                                    {(m.Reactions || []).length > 0 ? (
                                        <div className="cb-reactions">
                                            {m.Reactions.map((r) => (
                                                <button
                                                    key={`${r.NoteID}-${r.UserEmail}`}
                                                    type="button"
                                                    className="cb-reaction-chip"
                                                    title={r.UserName}
                                                    onClick={() => handleReact(m, r.Emoji)}
                                                >
                                                    <EmojiImg emoji={r.Emoji} size={16} />
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className="cb-bubble-meta">
                                        <span className="cb-bubble-time">
                                            {formatBubbleTime(m.CreatedAt)}
                                        </span>
                                        {isOut ? (
                                            <ReceiptTicks status={m.ReceiptStatus} />
                                        ) : null}
                                        {isOut ? (
                                            <button
                                                type="button"
                                                className={`cb-read-info-btn${
                                                    m.ReceiptStatus === 'read_all'
                                                        ? ' cb-read-info-btn--read'
                                                        : ''
                                                }`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleReadBy(m);
                                                }}
                                            >
                                                Info
                                            </button>
                                        ) : null}
                                    </div>
                                    <button
                                        type="button"
                                        className="cb-msg-menu-btn"
                                        aria-label="Message options"
                                        onClick={(e) => openMenu(e, m)}
                                        style={{ display: forwardSelectMode ? 'none' : undefined }}
                                    >
                                        <i className="bi bi-chevron-down" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {replyTo && !forwardSelectMode ? (
                <div className="cb-reply-bar">
                    <div>
                        <strong>Reply to {replyTo.UserName}</strong>
                        <span>
                            {replyTo.IsDeleted ? (
                                'Deleted message'
                            ) : (
                                <EmojiText text={replyTo.NoteContent} size={14} />
                            )}
                        </span>
                    </div>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                        <i className="bi bi-x-lg" />
                    </button>
                </div>
            ) : null}

            {forwardSelectMode ? (
                <div className="cb-forward-select-bar">
                    <button type="button" className="cb-fwd-cancel" onClick={cancelForwardSelect}>
                        Cancel
                    </button>
                    <span>
                        {selectedForwardIds.length
                            ? `${selectedForwardIds.length} selected`
                            : 'Select messages'}
                    </span>
                    <button
                        type="button"
                        className="cb-fwd-go"
                        disabled={!selectedForwardIds.length}
                        onClick={() => setForwardTargetOpen(true)}
                    >
                        Forward
                    </button>
                </div>
            ) : (
            <div className="cb-composer-wrap">
                {composerEmojiOpen ? (
                    <div
                        className="cb-composer-emoji-panel"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="cb-emoji-search">
                            <i className="bi bi-search" />
                            <input
                                type="text"
                                placeholder="Search emoji"
                                value={emojiSearch}
                                onChange={(e) => setEmojiSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div className="cb-emoji-scroll">
                            {!emojiSearch.trim() && recentEmojis.length > 0 ? (
                                <section className="cb-emoji-section">
                                    <h4>Recent</h4>
                                    <div className="cb-emoji-grid">
                                        {recentEmojis.map((em) => (
                                            <button
                                                key={`recent-${em}`}
                                                type="button"
                                                className="cb-composer-emoji-btn"
                                                onClick={() => insertComposerEmoji(em)}
                                            >
                                                <EmojiImg emoji={em} size={28} />
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                            {filteredEmojiCategories.length ? (
                                filteredEmojiCategories.map((cat) => (
                                    <section key={cat.id} className="cb-emoji-section">
                                        <h4>{cat.title}</h4>
                                        <div className="cb-emoji-grid">
                                            {cat.emojis.map((item) => (
                                                <button
                                                    key={`${cat.id}-${item.e}`}
                                                    type="button"
                                                    className="cb-composer-emoji-btn"
                                                    title={item.k}
                                                    onClick={() => insertComposerEmoji(item.e)}
                                                >
                                                    <EmojiImg emoji={item.e} size={28} />
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                ))
                            ) : (
                                <p className="cb-emoji-empty">No emoji found</p>
                            )}
                        </div>
                    </div>
                ) : null}
                <form className="cb-composer" onSubmit={onSubmit}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="cb-composer-file"
                        onChange={onPickImage}
                        aria-hidden
                        tabIndex={-1}
                    />
                    <button
                        type="button"
                        className={`cb-composer-emoji-toggle${composerEmojiOpen ? ' active' : ''}`}
                        aria-label="Insert emoji"
                        title="Emoji"
                        onClick={(e) => {
                            e.stopPropagation();
                            setComposerEmojiOpen((v) => {
                                if (v) setEmojiSearch('');
                                return !v;
                            });
                            setMenu(null);
                        }}
                    >
                        <i className="bi bi-emoji-smile" />
                    </button>
                    <button
                        type="button"
                        className="cb-composer-attach"
                        aria-label="Attach image"
                        title="Attach image"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <i className="bi bi-paperclip" />
                    </button>
                    <div className="cb-composer-main">
                        {pendingImage?.previewUrl ? (
                            <div className="cb-pending-image">
                                <img src={pendingImage.previewUrl} alt="Pending" />
                                <button
                                    type="button"
                                    className="cb-pending-clear"
                                    aria-label="Remove image"
                                    onClick={clearPendingImage}
                                >
                                    <i className="bi bi-x" />
                                </button>
                            </div>
                        ) : null}
                        <input
                            ref={draftInputRef}
                            type="text"
                            placeholder={
                                pendingImage
                                    ? 'Add a caption (optional)…'
                                    : replyTo
                                      ? 'Reply…'
                                      : 'Type a message'
                            }
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onPaste={onPasteImage}
                            autoComplete="off"
                        />
                    </div>
                    <button
                        type="submit"
                        className="cb-composer-send"
                        disabled={!draft.trim() && !pendingImage}
                        aria-label="Send"
                    >
                        <svg
                            className="cb-send-icon"
                            viewBox="0 0 24 24"
                            width="22"
                            height="22"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path
                                fill="currentColor"
                                d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"
                            />
                        </svg>
                    </button>
                </form>
            </div>
            )}

            {avatarLightboxOpen && groupAvatarSrc ? (
                <div
                    className="cb-dp-lightbox"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Group photo"
                    onClick={() => setAvatarLightboxOpen(false)}
                >
                    <button
                        type="button"
                        className="cb-dp-lightbox-close"
                        aria-label="Close"
                        onClick={() => setAvatarLightboxOpen(false)}
                    >
                        <i className="bi bi-x-lg" aria-hidden />
                    </button>
                    <img
                        src={groupAvatarSrc}
                        alt={groupTitle}
                        className="cb-dp-lightbox-img"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <div className="cb-dp-lightbox-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => {
                                setAvatarLightboxOpen(false);
                                avatarInputRef.current?.click();
                            }}
                        >
                            Change photo
                        </button>
                    </div>
                </div>
            ) : null}

            {menu ? (
                <div
                    className="cb-msg-menu-backdrop"
                    onClick={() => {
                        setMenu(null);
                        setEmojiBar(null);
                    }}
                >
                    {menu.bubble ? (
                        <div
                            className={`cb-menu-bubble-clone ${menu.isOut ? 'out' : 'in'}${
                                menu.msg.IsDeleted ? ' deleted' : ''
                            }`}
                            style={{
                                left: menu.bubble.left,
                                top: menu.bubble.top,
                                width: menu.bubble.width,
                                minHeight: menu.bubble.height,
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {!menu.isOut ? (
                                <div className="cb-bubble-author">{menu.msg.UserName}</div>
                            ) : null}
                            <div className={`cb-bubble-text${menu.msg.IsDeleted ? ' italic' : ''}`}>
                                {menu.msg.IsDeleted ? (
                                    'This message was deleted'
                                ) : (
                                    <EmojiText text={menu.msg.NoteContent} size={20} />
                                )}
                            </div>
                            <div className="cb-bubble-meta">
                                <span className="cb-bubble-time">
                                    {formatBubbleTime(menu.msg.CreatedAt)}
                                </span>
                                {menu.isOut ? (
                                    <ReceiptTicks status={menu.msg.ReceiptStatus} />
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    <div
                        className={`cb-msg-popup${menu.placeBelow ? ' below' : ''}`}
                        style={{
                            left: menu.x,
                            top: menu.y,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="cb-msg-menu">
                            {menu.msg.IsOwn ? (
                                <button type="button" onClick={() => handleReadBy(menu.msg)}>
                                    <i className="bi bi-info-circle" /> Message info
                                </button>
                            ) : null}
                            <button type="button" onClick={() => handleReply(menu.msg)}>
                                <i className="bi bi-reply" /> Reply
                            </button>
                            <button type="button" onClick={() => startForwardSelect(menu.msg)}>
                                <i className="bi bi-reply-fill flip" /> Forward
                            </button>
                            {!menu.msg.IsDeleted ? (
                                <button type="button" onClick={() => handleCopyMessage(menu.msg)}>
                                    <i className="bi bi-copy" /> Copy
                                </button>
                            ) : null}
                            {canDeleteMessage(menu.msg) ? (
                                <>
                                    <div className="cb-menu-sep" />
                                    <button
                                        type="button"
                                        className="danger"
                                        onClick={() => handleDelete(menu.msg)}
                                    >
                                        <i className="bi bi-trash" /> Delete
                                    </button>
                                </>
                            ) : null}
                        </div>

                        <div className="cb-react-pill">
                            {QUICK_EMOJIS.map((em) => (
                                <button
                                    key={em}
                                    type="button"
                                    onClick={() => handleReact(menu.msg, em)}
                                >
                                    <EmojiImg emoji={em} size={18} />
                                </button>
                            ))}
                            <button
                                type="button"
                                className="cb-react-more"
                                aria-label="More emojis"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setEmojiBar((v) => (v ? null : { forMsg: menu.msg }));
                                }}
                            >
                                <i className="bi bi-plus-lg" />
                            </button>
                            {emojiBar?.forMsg ? (
                                <div className="cb-react-more-panel">
                                    {EMOJI_CATEGORIES[0].emojis.slice(0, 48).map((item) => (
                                        <button
                                            key={item.e}
                                            type="button"
                                            onClick={() => handleReact(menu.msg, item.e)}
                                        >
                                            <EmojiImg emoji={item.e} size={20} />
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            ) : null}

            {readByModal ? (
                <div className="cb-modal-backdrop" onClick={() => setReadByModal(null)}>
                    <div className="cb-modal cb-modal--info" onClick={(e) => e.stopPropagation()}>
                        <div className="cb-modal-header">
                            <i className="bi bi-info-circle" />
                            <span>Message info</span>
                            <button type="button" onClick={() => setReadByModal(null)}>
                                <i className="bi bi-x-lg" />
                            </button>
                        </div>
                        <div className="cb-info-section-title">
                            <i className="bi bi-check2-all cb-ticks--read" /> Read by
                        </div>
                        <ul className="cb-read-by-list">
                            {readByModal.readBy.length ? (
                                readByModal.readBy.map((r) => (
                                    <li key={`read-${r.EmailId}`}>
                                        <span className="cb-read-by-name">{r.UserName}</span>
                                        <span className="cb-read-by-time">
                                            {formatReadTime(r.ReadAt)}
                                        </span>
                                    </li>
                                ))
                            ) : (
                                <li className="cb-empty-read">Not read by anyone yet</li>
                            )}
                        </ul>
                        {(() => {
                            const readEmails = new Set(
                                readByModal.readBy.map((r) => String(r.EmailId).toLowerCase())
                            );
                            const pendingDelivery = (readByModal.deliveredTo || []).filter(
                                (r) => !readEmails.has(String(r.EmailId).toLowerCase())
                            );
                            return pendingDelivery.length ? (
                                <>
                                    <div className="cb-info-section-title">
                                        <i className="bi bi-check2 cb-ticks--delivered" /> Delivered to
                                    </div>
                                    <ul className="cb-read-by-list">
                                        {pendingDelivery.map((r) => (
                                            <li key={`del-${r.EmailId}`}>
                                                <span className="cb-read-by-name">{r.UserName}</span>
                                                <span className="cb-read-by-time">
                                                    {formatReadTime(r.DeliveredAt)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            ) : null;
                        })()}
                        {(readByModal.remaining || []).length ? (
                            <>
                                <div className="cb-info-section-title">Remaining</div>
                                <ul className="cb-read-by-list">
                                    {readByModal.remaining.map((r) => (
                                        <li key={`rem-${r.EmailId}`}>
                                            <span className="cb-read-by-name">{r.UserName}</span>
                                            <span className="cb-read-by-time">Not delivered yet</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {forwardTargetOpen ? (
                <div className="cb-modal-backdrop" onClick={() => setForwardTargetOpen(false)}>
                    <div className="cb-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="cb-modal-header">
                            <span>
                                Forward {selectedForwardIds.length} message
                                {selectedForwardIds.length === 1 ? '' : 's'} to
                            </span>
                            <button type="button" onClick={() => setForwardTargetOpen(false)}>
                                <i className="bi bi-x-lg" />
                            </button>
                        </div>
                        <ul className="cb-forward-list">
                            {forwardTargets.length ? (
                                forwardTargets.map((g) => (
                                    <li key={g.RequestNo}>
                                        <button
                                            type="button"
                                            disabled={forwardSending}
                                            onClick={() => handleForwardSend(g.RequestNo)}
                                        >
                                            {g.ProjectName || g.RequestNo}
                                        </button>
                                    </li>
                                ))
                            ) : (
                                <li className="cb-empty-read">No other chats available</li>
                            )}
                        </ul>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ChatThread;
