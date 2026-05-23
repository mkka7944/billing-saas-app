import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8-sig') as f:
        content = f.read()
    
    brace_stack = []
    paren_stack = []
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for j, char in enumerate(line):
            if char == '{':
                brace_stack.append((i + 1, j + 1))
            elif char == '}':
                if not brace_stack:
                    print(f"Extra closing brace at line {i + 1}:{j + 1}")
                else:
                    brace_stack.pop()
            elif char == '(':
                paren_stack.append((i + 1, j + 1))
            elif char == ')':
                if not paren_stack:
                    print(f"Extra closing parenthesis at line {i + 1}:{j + 1}")
                else:
                    paren_stack.pop()
    
    for line_num, col in brace_stack:
        print(f"Unclosed opening brace from line {line_num}:{col}")
    for line_num, col in paren_stack:
        print(f"Unclosed opening parenthesis from line {line_num}:{col}")

if __name__ == "__main__":
    check_braces(sys.argv[1])
