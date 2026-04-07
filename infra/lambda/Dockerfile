FROM public.ecr.aws/lambda/python:3.13

# Graphviz for layout engine
RUN dnf install -y graphviz && dnf clean all

# Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY src/ src/
COPY infra/lambda/handler.py lambda_function.py

CMD ["lambda_function.handler"]
